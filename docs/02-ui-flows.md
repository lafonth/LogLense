# Parcours d'interface

Tout passe par un composant unique, [`HomeClient`](../src/components/HomeClient.tsx), qui n'a
pas de routeur interne : **c'est la query string qui décide de l'écran**, et `useRouteSync`
qui déclenche les analyses quand elle change.

## Quel écran s'affiche

L'ordre des retours dans `HomeClient` est significatif — le premier qui matche gagne.

```mermaid
flowchart TD
    START([Rendu de HomeClient]) --> Q1{meta de rapport<br/>+ acteur nommé<br/>+ résultat ou chargement ?}
    Q1 -->|oui| RD[ReportDashboard]
    Q1 -->|non| Q2{input personnage<br/>présent ?}
    Q2 -->|oui| CD[CharacterDashboard]
    Q2 -->|non| Q3{spec dans l'URL<br/>+ char/server ou report/actor ?}
    Q3 -->|oui| SPIN[LoadingSpinner]
    Q3 -->|non| Q4{session}
    Q4 -->|non authentifié| ML[MarketingLanding]
    Q4 -->|en cours| NULL[rien]
    Q4 -->|authentifié| Q5{mode choisi ?}
    Q5 -->|aucun| MS[ModeSelector]
    Q5 -->|report| RF[ReportForm]
    Q5 -->|character| Q6{session ?}
    Q6 -->|oui| LF[LoggedInCharacterForm]
    Q6 -->|non| CF[CharacterForm]

    style SPIN fill:#3f3f1e,color:#fff
```

Le `LoadingSpinner` est gardé par la présence de `spec` dans l'URL, et ce garde-fou est
délibéré : sans `spec`, `useRouteSync` ne lance rien, et un spinner tournerait indéfiniment.
On retombe alors sur le formulaire, seul endroit où la spec se choisit.

## Chemin personnage, de bout en bout

```mermaid
sequenceDiagram
    participant U as Joueur
    participant F as CharacterForm
    participant R as Router (URL)
    participant S as useRouteSync
    participant A as useAnalysis
    participant API as /api/analyze/:id
    participant W as Warcraft Logs

    U->>F: nom, royaume, région, difficulté, zone, spec
    F->>R: push /?char&server&region&difficulty&zone&spec
    R->>S: la query change
    S->>A: start(AnalysisInput)
    Note over A: un état par boss,<br/>tous à 'loading'
    par un appel par boss, en parallèle
        A->>API: POST { character, difficulty, encounterName, specId }
        API->>W: rankings → meilleur parse → combat → références
        API-->>A: BossResult | null | { error }
        A->>A: bossStates[i] = success/error, re-render
    end
    A-->>U: CharacterDashboard, chaque carte s'allume dès qu'elle arrive
```

Trois comportements de `useAnalysis` valent d'être connus :

- **Cache par difficulté.** `cacheRef` est indexé par palier ; passer Héroïque → Mythique →
  Héroïque réaffiche instantanément. Le cache est vidé dès que le nom ou le royaume change.
- **Le résultat n'est écrit que si la difficulté est toujours active.** `activeDiffRef`
  évite qu'une réponse tardive d'un palier abandonné écrase l'écran courant.
- **`switchBossSpec`** relance un seul boss avec `specIdOverride`, sans toucher aux autres.
  C'est le cas du joueur qui a joué deux specs sur le même palier.

## Chemin rapport

```mermaid
sequenceDiagram
    participant U as Joueur
    participant F as ReportForm
    participant M as useReportMeta
    participant C as HomeClient
    participant RA as useReportAnalysis
    participant API as /api/report/analyze

    U->>F: colle un code de rapport WCL
    F->>M: GET /api/report/:code
    M-->>F: titre, combats, acteurs
    U->>F: choisit un acteur, une spec, une difficulté
    F->>C: handleReportSubmit(code, actor, spec, diff, fights, actors, title)
    C->>C: setReportKey + setReportContext + push URL
    C->>RA: start(...)
    Note over RA: regroupe les fights par encounterID,<br/>garde le DERNIER kill de chaque boss
    alt aucun kill à cette difficulté
        RA-->>U: « No kills found for the selected difficulty »
    else
        RA->>API: POST { code, actorId, actorName, specId, difficulty, encounters }
        API-->>RA: AnalysisResult (tous les boss d'un coup)
        RA-->>U: ReportDashboard
    end
```

Différence structurelle avec le chemin personnage : **une seule requête pour tous les boss**,
donc pas d'affichage progressif — le tableau de bord attend le résultat complet. Le chemin
personnage, lui, tire un appel par boss et remplit l'écran au fur et à mesure.

Changer d'acteur (`handleSwitchActor`) relance l'analyse sur le même rapport ; la spec vient
de `reportResult.input.specId` ou du paramètre `spec` de l'URL, avec `0` en dernier recours —
mieux vaut afficher « spec inconnue » qu'affirmer une spec fausse.

## L'écran de résultats

Les deux tableaux de bord partagent `BossContentPanel`, donc les mêmes onglets.

```mermaid
graph TB
    subgraph shell["Dashboard (character ou report)"]
        HEAD[DashboardHeader<br/>difficulté · reset · switcher]
        SIDE[BossSidebar<br/>un boss par ligne · Sheet en mobile]
        TABS[Tabs : Overview · Comparison · AI Report]
    end

    TABS --> OV
    TABS --> CP
    TABS --> AIT

    subgraph OV["OverviewTab"]
        DPS[DpsBanner<br/>dps · percentiles · kill time]
        TRAJ[TrajectoryChart<br/>percentile verrouillé dans le temps]
        DMG[DamageBreakdown]
        ROT[RotationCards]
    end

    subgraph CP["ComparisonTab"]
        BAN[ComparabilityBanner<br/>good / fair / poor]
        REFL[ReferenceLabels<br/>bouton « pas comparable »]
        ST[StatsTable<br/>min · médiane · max des références]
        TD[TalentDiff<br/>toi seul / eux seuls / k sur n]
        OC[OpeningChain<br/>première divergence]
    end

    subgraph AIT["AIReportTab"]
        KEY[useApiKey · choix du fournisseur]
        STREAM[StreamingText — SSE]
        FB[ReportFeedback<br/>utile / inutile + axes]
    end

    style REFL fill:#3f3f1e,color:#fff
    style FB fill:#3f3f1e,color:#fff
    style AIT fill:#4a2f5f,color:#fff
```

Les deux blocs en jaune sont les seuls endroits où l'utilisateur **écrit** dans le corpus.
Tout le reste est en lecture.

L'onglet AI Report est le seul qui ne dépend pas d'un boss sélectionné : il envoie
l'`AnalysisResult` entier et le sélecteur de boss disparaît quand il est actif.

## Règles d'interface qui ont chacune coûté une correction

- **Le rouge (`text-danger`) est réservé aux erreurs.** Un écart aux références s'affiche en
  bleu (`text-deviation`) : une position dans une distribution n'est pas une faute. Le rouge
  doit rester disponible pour signaler une comparaison illégitime.
- **Tous les chiffres sont en `font-mono`**, y compris dans une phrase — on enveloppe le
  nombre, pas la phrase. Seule la prose du rapport IA fait exception (`font-sans`).
- **On ne surcharge jamais la taille d'une primitive via `className`.** Tailwind départage
  deux utilitaires sur la même propriété par leur ordre dans la feuille générée, pas par leur
  position dans la chaîne : la surcharge est silencieusement ignorée. Si aucune taille ne
  convient, on étend la primitive.
- **Aucun `style={{}}`**, sauf deux géométries calculées à l'exécution : les largeurs de
  barres dans `DamageBreakdown` et `RotationCards`.
- **`Sheet` est le traitement mobile des colonnes latérales** : il rend ses enfants
  directement à partir de `md`, et derrière un déclencheur en dessous. L'envelopper suffit,
  aucune media query à écrire.
