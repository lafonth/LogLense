# Le corpus d'étiquettes

Le seul actif que LogLense ne peut pas reconstituer plus tard. Le vivier de candidats d'un
boss n'existera plus dans un mois ; les jugements portés dessus, si — à condition d'avoir été
écrits au moment où ils ont eu lieu.

## Les quatre enregistrements et leur clé commune

```mermaid
erDiagram
    EXPOSURE ||--o{ VERDICT : "renderId"
    EXPOSURE ||--o| ADVICE : "renderId"
    ADVICE ||--o| FEEDBACK : "renderId"

    EXPOSURE {
        int v "3"
        string kind "exposure"
        string renderId PK
        string by "hash salé ou null"
        json subject "code, fightID, actorId, dpsSource"
        json references "TOUTE la fenêtre vérifiée"
        json comparability "instantané du vivier"
    }
    VERDICT {
        int v "3"
        string kind "verdict"
        string renderId FK
        string by "hash salé — jamais null"
        string reason "externals|set-bonus|kill-time|ilvl|other"
        json reference "code, fightID, actorId, disqualifiedBy"
        json scores "distance, ilvlGap, killTimeGapPct, rank"
    }
    ADVICE {
        int v "3"
        string kind "advice"
        string renderId FK
        int promptVersion
        string provider
        string model
        json axes "les axes couverts — jamais le texte"
    }
    FEEDBACK {
        int v "3"
        string kind "feedback"
        string renderId FK
        string verdict "useful|useless"
        json uselessAxes
    }
```

`renderId` — un `randomUUID()` posé côté serveur sur chaque `BossResult` — est **la seule clé
du corpus**. Un enregistrement sans lui ne se joint à rien : les deux endpoints le refusent.

## Quand chaque enregistrement naît

```mermaid
sequenceDiagram
    participant B as Navigateur
    participant AN as /api/analyze/:id
    participant AI as /api/ai-report
    participant LC as /api/labels/comparability
    participant LR as /api/labels/report
    participant R as Redis

    B->>AN: analyse un boss
    AN->>R: await recordExposure — ce qui va être MONTRÉ
    AN-->>B: BossResult (renderId)

    B->>AI: demande un rapport IA
    AI->>R: await recordAdvice — ce qui va être CONSEILLÉ
    AI-->>B: flux SSE

    Note over B: le lecteur juge, ou pas

    opt clic « pas comparable » sur une référence
        B->>LC: verdict + renderId
        LC->>R: RPUSH labels:comparability:AAAA-MM
    end
    opt clic utile / inutile
        B->>LR: verdict + axes + renderId
        LR->>R: RPUSH labels:report:AAAA-MM
    end
```

Les deux écritures serveur sont **`await`ées avant la réponse**, et c'est intentionnel : sur
un runtime serverless, une promesse laissée en `void` part avec la fonction, et c'est toute
la classe positive qui disparaît. Elles n'échouent jamais bruyamment non plus — le rapport ne
dépend pas de sa capture, mais la capture ne coûte jamais l'analyse.

## Pourquoi l'exposition existe

C'est la classe positive que le corpus n'avait pas. Les verdicts « pas comparable » ne
capturent qu'un refus ; sans trace de ce qui a été **montré et non refusé**, un modèle
n'apprendrait que sur des négatifs.

```mermaid
graph TB
    E["ExposureRecord.references[]<br/>toute la fenêtre vérifiée, 12 entrées"] --> C{"contestable ?"}
    C -->|"oui — était dans le panel,<br/>l'écran offrait un bouton"| C1{"un verdict porte<br/>le même renderId ?"}
    C1 -->|non| POS["positif FAIBLE<br/>montré, contestable, non contesté"]
    C1 -->|oui| NEG["négatif explicite"]
    C -->|"non — vérifiée mais hors panel"| RIEN["son silence ne dit RIEN.<br/>Toute autre lecture est une invention"]

    style POS fill:#1e3a5f,color:#fff
    style RIEN fill:#5f2f2f,color:#fff
```

Le champ `explored` marque la référence tirée hors de la fenêtre de distance. Un entraînement
qui la confondrait avec les autres n'apprendrait que le biais du sélecteur — voir
[03-comparabilite.md](03-comparabilite.md).

## Ce que le corpus ne portera jamais

| Exclu | Raison |
|---|---|
| Les noms de tiers | §5c des CGU RPGLogs. Les références sont désignées par `code:fightID:actorId`, jamais par nom |
| L'e-mail ou le nom de session | Seulement `SHA-256(identifiant + LABEL_SALT)`. Si `LABEL_SALT` manque, l'endpoint répond `503` et **n'écrit rien** — échec fermé, pas identité en clair |
| La prose du rapport IA | Sorties de modèle : incomparables entre elles, elles gonflent une clé qu'on ne peut pas nettoyer, et elles peuvent recopier des noms de tiers. Les axes couverts disent tout ce qu'un modèle peut apprendre : *sur quoi* on a parlé, pas *comment* |
| Le moindre champ libre | Un « dites-nous pourquoi » ouvre, dans un corpus en écriture seule, un canal de données personnelles qu'aucun plafond de longueur ne referme |
| Les mesures WCL recopiées | Depuis `v: 3`, ce sont des pointeurs : les mesures se réhydratent depuis WCL. Exception : les **écarts signés** (`scores`), qui sont des jugements de LogLense sur un vivier disparu et ne se recalculent pas |

## Défenses de l'endpoint d'étiquettes

```mermaid
flowchart TD
    IN([POST /api/labels/comparability]) --> A{session ?}
    A -->|non| E401[401 Unauthorized]
    A -->|oui| B{"corps ≤ 4096 octets ?"}
    B -->|non| E413[413 Payload too large]
    B -->|oui| C{JSON valide ?}
    C -->|non| E400a[400 Invalid JSON]
    C -->|oui| D["parseSubmission :<br/>chaque champ vérifié,<br/>chaînes ≤ 64 caractères,<br/>motifs bornés et sans doublon"]
    D -->|refus| E400b[400 Invalid label]
    D -->|ok| F{"LABEL_SALT présent ?"}
    F -->|non| E503a[503 — rien n'est écrit]
    F -->|oui| G{"quota horaire<br/>sur l'identité hachée"}
    G -->|dépassé| E429["429 + Retry-After"]
    G -->|ok| H["RPUSH labels:comparability:AAAA-MM"]
    H -->|échec Redis| E503b[503 Label capture unavailable]
    H -->|ok| OK[200 ok:true]

    style E503a fill:#5f2f2f,color:#fff
```

Trois choix qui méritent d'être explicites :

- **Le quota se compte sur l'identité hachée, jamais sur l'IP.** C'est un compte qui écrit
  dans le corpus, et c'est un compte qu'un flot de verdicts fabriqués empoisonnerait.
- **Aucune réponse ne prétend qu'une écriture a eu lieu si elle n'a pas eu lieu.** Un clic
  perdu est une donnée perdue.
- **Les champs que le serveur possède — `v`, `kind`, `at`, `by` — ne sont jamais repris de
  l'entrée.** Le client ne choisit ni qui il est ni quand cela s'est produit.

Le plafond de 4096 octets sur le corps existe parce que les route handlers App Router n'en
appliquent aucun par défaut : une session valide pourrait pousser en boucle des mégaoctets
dans la clé du mois. Saturer Upstash ne détruirait pas que le corpus — c'est le même client
qui sert la whitelist d'authentification.

## Stockage

Une liste Redis par mois et par type, en append-only :

```
labels:exposure:2026-08        expositions
labels:comparability:2026-08   verdicts « pas comparable »
labels:report:2026-08          empreintes de conseil ET retours de lecteur
```

Bornées par construction, lisibles sans index. Le champ `v` n'est pas décoratif : le corpus
survivra à plusieurs versions du code, et sans lui on ne saurait plus dans un an ce que
signifiaient les enregistrements d'aujourd'hui. `v: 3` marque le passage aux pointeurs — les
enregistrements `2` portent des mesures WCL recopiées, les `3` les réhydratent.

[`redis.ts`](../src/lib/redis.ts) est un client REST Upstash minimal : `GET`, `SET`, `RPUSH`.
C'est la seule persistance du produit.
