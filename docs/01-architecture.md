# Architecture

## Les couches

```mermaid
graph TB
    subgraph nav["Navigateur"]
        HC[HomeClient]
        HOOKS[hooks<br/>useAnalysis · useReportAnalysis<br/>useAIReport · useRouteSync]
        COMP[composants<br/>dashboards · onglets · primitives ui]
        HC --> HOOKS
        HC --> COMP
    end

    subgraph edge["Next.js — route handlers, runtime nodejs"]
        R1["/api/analyze/:encounterId"]
        R2["/api/report/analyze"]
        R3["/api/report/:code"]
        R4["/api/ai-report"]
        R5["/api/labels/comparability<br/>/api/labels/report"]
        R6["/api/zones · /api/search/realm<br/>/api/user/*"]
        R7["/api/auth/[...nextauth]"]
    end

    subgraph domaine["src/lib — le domaine"]
        PIPE[wcl/pipeline.ts]
        RPIPE[wcl/report-pipeline.ts]
        REFS[wcl/references.ts]
        FIGHT[wcl/fight-data.ts]
        COMB[wcl/combatant.ts]
        ELIG[wcl/eligibility.ts]
        CMP[comparison/*<br/>fonctions pures]
        AI[ai/prompt.ts + providers]
        LAB[labels/*]
    end

    subgraph ext["Extérieur"]
        WCL[(Warcraft Logs API v2<br/>GraphQL)]
        REDIS[(Upstash Redis<br/>REST GET/SET/RPUSH)]
        PROV[(Anthropic · Gemini · Groq)]
    end

    HOOKS -->|fetch| R1 & R2 & R3 & R4 & R5
    COMP --> R5
    R1 --> PIPE
    R2 --> RPIPE
    PIPE & RPIPE --> REFS & FIGHT & COMB
    REFS --> ELIG
    PIPE & RPIPE & R3 --> WCL
    R4 --> AI --> PROV
    R1 & R2 & R4 & R5 --> LAB --> REDIS
    R6 & R7 --> REDIS
    COMP --> CMP

    style REFS fill:#1e3a5f,color:#fff
    style AI fill:#4a2f5f,color:#fff
```

**Ce que la carte impose.** `references.ts` est le seul point où la comparabilité évolue —
filtrer sur l'ilvl, sur le set bonus, paralléliser, passer à une distribution : tout s'écrit
là et jamais dans les pipelines. Les deux pipelines ne doivent rester que de la plomberie
« trouver le sujet, appeler le noyau, assembler le `BossResult` ».

## Les deux chemins d'analyse

```mermaid
flowchart TD
    subgraph A["Chemin personnage — pipeline.ts"]
        A1[nom + royaume + région<br/>+ difficulté + spec] --> A2["Q_CHARACTER_RANKINGS<br/>(ou _SPEC si override)"]
        A2 --> A3{ranks vides ?}
        A3 -->|oui| AN[null]
        A3 -->|non| A4["meilleur parse = max(amount)<br/>→ code, fightID, durée"]
        A4 --> A5[findCombatantByName<br/>→ spec réelle]
        A5 --> A6["percentile verrouillé :<br/>ranks[].rankPercent"]
        A5 --> A7["trajectoire : parseTrajectory(ranks)<br/>déjà payée par la même requête"]
    end

    subgraph B["Chemin rapport — report-pipeline.ts"]
        B1["code + actorId + fightId<br/>+ difficulté"] --> B2["Q_REPORT_RANKINGS_DPS<br/>+ _BOSSDPS<br/>(report-rankings.ts : deux requêtes<br/>pour tous les combats du rapport,<br/>entrée retrouvée par fightID)"]
        B1 --> B3[findCombatantByActorId<br/>→ spec réelle]
        B2 --> B4["rankPercent ici = percentile DU JOUR"]
        B4 --> B5{server.name<br/>et region ?}
        B5 -->|oui| B6["fetchCharacterHistory<br/>→ percentile verrouillé + trajectoire"]
        B5 -->|non| B7["dégradé : on affiche<br/>le percentile du jour"]
    end

    A5 --> C1
    B3 --> C1

    subgraph C["Noyau commun"]
        C1[fetchCandidatePool<br/>10 pages en parallèle]
        C2[fetchFightData<br/>dégâts · casts · uptimes · ilvl]
        C1 --> C3[resolveReferences]
        C2 --> C3
        C3 --> C4["BossResult<br/>{ renderId, character,<br/>topPlayers, sample, comparability }"]
    end

    style C3 fill:#1e3a5f,color:#fff
```

### Le piège des homonymes

Deux champs s'appellent `rankPercent` et ne mesurent pas la même chose :

| Source | Sens réel |
|---|---|
| `characterData…dps.ranks[].rankPercent` | Percentile **verrouillé au moment du kill** — celui que le joueur cite |
| `report.rankings…rankPercent` | Percentile **recalculé aujourd'hui** contre la population courante |

Le chemin rapport réconcilie les deux via `historical-parse.ts`, en retrouvant le parse par
`code` + `fightID`. Quand la réconciliation échoue (log privé, royaume absent de l'entrée,
panne WCL), l'écran retombe sur le percentile du jour — et c'est le seul cas où les deux
chemins annoncent des mesures différentes. Même chose pour la trajectoire, qui tombe avec.

## Le `BossResult` — le contrat unique

Tout l'affichage, tout le prompt IA et toute la capture se dérivent de cet objet.

```mermaid
classDiagram
    class BossResult {
        renderId : uuid
        encounter, encounterId
        specId, difficulty
        fightTargets
    }
    class Character {
        stats, rotation
        damageTable
        dps, bossDps, killTime
        overallPct / todayPct / bossDpsPct / bracket
        source : code, fightID, actorId
        trajectory
        eligibility
    }
    class TopPlayer {
        stats, rotation, damageTable, dps
        provenance : code, fightID, distance,<br/>disqualifiedBy, explored
    }
    class SampleEntry {
        code, fightID, actorId
        qualified, explored
        ilvl, tier, externals
    }
    class Comparability {
        level : good | fair | poor
        myIlvl / referenceIlvl
        myKillTimeMs / referenceKillTimeMs
        candidatesConsidered, pagesFetched
        disqualified, substituted
    }
    BossResult --> Character
    BossResult --> "0..3" TopPlayer
    BossResult --> "0..12" SampleEntry
    BossResult --> Comparability
```

`renderId` est un `randomUUID()` posé côté serveur à chaque analyse. Ce n'est pas un détail
de traçage : c'est **la seule clé de jointure du corpus** entre ce qui a été montré, ce qui a
été contesté, ce que le rapport IA a conseillé et ce que le lecteur en a pensé. Voir
[05-capture-de-donnees.md](05-capture-de-donnees.md).

## Inventaire des routes

| Route | Méthode | Rôle |
|---|---|---|
| `/api/analyze/[encounterId]` | POST | Un boss du chemin personnage. Appelle `analyzeBoss`, puis **attend** `recordExposure` avant de répondre |
| `/api/report/analyze` | POST | Le chemin rapport, pour tous les boss tués à la difficulté demandée |
| `/api/report/[code]` | GET | Métadonnées d'un rapport WCL : titre, combats, acteurs — sert à peupler le formulaire |
| `/api/ai-report` | GET | Quels fournisseurs ont une clé côté serveur |
| `/api/ai-report` | POST | Construit le prompt, écrit l'empreinte de conseil, ouvre le flux SSE |
| `/api/labels/comparability` | POST | Verdict « pas comparable » — authentifié, quota, validation champ par champ |
| `/api/labels/report` | POST | Retour du lecteur sur le rapport IA |
| `/api/zones`, `/api/search/realm` | GET | Données de formulaire |
| `/api/user/{characters,favourites,preferences,recents}` | GET/POST | Préférences persistées en Redis |
| `/api/auth/[...nextauth]` | — | NextAuth ; la whitelist vit dans le même Redis |

Toutes les routes d'analyse déclarent `export const runtime = 'nodejs'` : elles ont besoin de
`node:crypto` (`randomUUID`, le hachage salé) et de sessions NextAuth côté serveur.

**Une conséquence non évidente du serverless** : une promesse laissée en `void` meurt avec la
fonction. C'est pourquoi `recordExposure` et `recordAdvice` sont `await`ées *avant* la
réponse, même si elles ne peuvent jamais faire échouer l'analyse. Ce qui part sans être
capturé est définitivement perdu — le corollaire opérationnel de `CLAUDE.md`.

## Vérification

```
pnpm typecheck && pnpm test && pnpm lint && pnpm format:check
```

Les quatre passent avant tout commit ; le hook pre-commit les exécute.
