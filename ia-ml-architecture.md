# IA structurante, familles de modèles et architectures

Note de synthèse — projet outil WoW monétisable.
Couvre : la distinction IA gadget / IA structurante, les familles de modèles ML,
et les architectures correspondantes.

---

## 1. IA gadget vs IA structurante

### Le test

> Retire l'IA du produit. S'il tient encore debout, l'IA était un gadget.

C'est le seul critère qui compte. Il ne porte pas sur la sophistication du modèle
mais sur sa **position dans la chaîne de valeur** : avant ou après la construction
de la donnée.

### Les deux positions

```mermaid
flowchart LR
    subgraph GADGET["IA en aval — gadget"]
        A1[API WCL] --> A2[Pull + structuration<br/>code déterministe]
        A2 --> A3[Donnée que<br/>tout le monde a]
        A3 --> A4[LLM<br/>rédige le commentaire]
        A4 --> A5[Rapport]
    end

    subgraph STRUCT["IA en amont — structurante"]
        B1[API WCL] --> B2[Pull large<br/>40+ candidats]
        B2 --> B3[Extraction<br/>de features]
        B3 --> B4[Modèle ML<br/>sélection + patterns]
        B4 --> B5[Donnée que<br/>personne d'autre n'a]
        B5 --> B6[LLM<br/>rédige le commentaire]
        B6 --> B7[Rapport]
    end
```

Dans le cas gadget, la valeur ajoutée est la prose. Elle se réplique en un week-end
par n'importe qui ayant accès à la même API publique.

Dans le cas structurant, la valeur ajoutée est **la donnée produite par le modèle**.
Le LLM final reste présent — il est utile pour l'UX — mais il n'est plus l'argument
de vente.

### Application au PoC actuel

| Composant | Position | Verdict |
|---|---|---|
| Pull WCL + structuration | Déterministe | Nécessaire, non différenciant |
| Filtre kill time (`KILL_TIME_TOLERANCE = 0.2`) | Seuil codé en dur | Réplicable en une ligne |
| Rapport de coaching LLM | Aval | **Gadget** |

Le rapport commente des agrégats (casts totaux, uptime, diff de talents) que
l'utilisateur peut lire lui-même dans l'onglet Comparison. C'est le cas gadget
au sens littéral.

---

## 2. Les familles de modèles

### Vue d'ensemble

```mermaid
flowchart TD
    ML[Machine Learning]
    ML --> SUP[Supervisé<br/>apprend d'exemples étiquetés]
    ML --> UNSUP[Non supervisé<br/>trouve des structures seul]
    ML --> GEN[Génératif / LLM<br/>pré-entraîné, appelé via API]

    SUP --> SUP1["Classifieur de comparabilité<br/>→ ce log est-il comparable ?"]
    UNSUP --> UNSUP1["Clustering de séquences<br/>→ familles d'opening"]
    UNSUP --> UNSUP2["Détection d'anomalies<br/>→ écart à la distribution"]
    GEN --> GEN1["Rédaction du rapport<br/>→ prose lisible"]
```

### Comparaison économique

| | LLM via API | Modèle entraîné |
|---|---|---|
| Coût fixe | 0 | Collecte de données + entraînement |
| Coût par requête | Tokens — réel et récurrent | ~0 (quelques ms CPU) |
| Poids en production | Aucun (appel réseau) | Quelques Mo, chargé en mémoire |
| Latence | 1–10 s | < 10 ms |
| Ce que tu possèdes | Rien | Le modèle **et** les données |
| Réplicable par un concurrent | Oui, en un week-end | Non, sans tes données |
| Dérive saisonnière | Forte si connaissance métier écrite à la main | Faible si features structurelles |

### Le point central

**L'algorithme n'est jamais l'actif.** scikit-learn est public. Ce qui n'est pas
réplicable, c'est le **jeu de données étiqueté** — les décisions accumulées
"ce log est comparable / ne l'est pas".

Conséquence opérationnelle : la capture des étiquettes doit démarrer avant
l'entraînement, avant même de savoir si le modèle sera construit. Les données
non capturées sont perdues définitivement.

> **Repousse le calcul, jamais la capture.**

### Sur la dérive saisonnière

Objection courante : « à chaque tier, le modèle est périmé ».

```mermaid
flowchart LR
    subgraph FAIBLE["Dérive faible"]
        C1["Comparabilité<br/>features structurelles :<br/>écart kill time, ilvl,<br/>set bonus, externals"]
        C1 --> C2["Une PI reste une PI<br/>à chaque extension"]
    end

    subgraph AUTO["Dérive auto-réparée"]
        D1["Clustering d'openings<br/>non supervisé"]
        D1 --> D2["Relance sur les logs<br/>de la nouvelle saison<br/>→ nouvelles familles<br/>émergent seules"]
    end

    subgraph FORTE["Dérive forte"]
        E1["Skills LLM écrites<br/>à la main"]
        E1 --> E2["Réécriture manuelle<br/>à chaque tier × 39 specs"]
        E2 --> E3["Et vides en semaine 1,<br/>quand le besoin<br/>est maximal"]
    end
```

Le problème décisif de l'approche knowledge-driven : en début de saison, la
connaissance experte **n'existe pas encore**. Les logs sont la seule source de
vérité disponible. Une approche data-driven fonctionne dès le premier soir du tier ;
une approche knowledge-driven attend qu'un tiers publie un guide — et redistribue
alors du gratuit.

---

## 3. Architectures

### v0 — état actuel (LogLense)

```mermaid
flowchart LR
    U[Utilisateur] --> N[Next.js API route]
    N --> W1[WCL : rankings joueur]
    N --> W2[WCL : world rankings]
    W2 --> F["Filtre ±20% kill time<br/>fallback silencieux<br/>vers top 3 mondial"]
    F --> L["Boucle séquentielle<br/>3 × 2 requêtes"]
    L --> S[Structuration]
    S --> LLM[LLM : rapport]
    LLM --> UI[UI]
```

Caractéristiques : stateless, aucun stockage, aucun coût fixe.
Limites : fenêtre de candidats étroite, aucune donnée accumulée,
aucun actif constitué.

### v1 — cible court terme

Reste synchrone. Deux ajouts seulement.

```mermaid
flowchart LR
    U[Utilisateur] --> N[Next.js API route]
    N --> W["WCL : 40+ candidats<br/>Promise.all parallèle"]
    W --> FEAT["Extraction de features<br/>ilvl, set bonus, externals,<br/>phase, kill time"]
    FEAT --> RULE["Sélection par règles<br/>+ affichage explicite<br/>du niveau de confiance"]
    RULE --> S[Structuration]
    S --> LLM[LLM : rapport]
    LLM --> UI[UI]
    UI -.->|"bouton<br/>pas comparable"| DB[(Étiquettes)]
```

Les deux ajouts qui comptent :

1. **Fenêtre de candidats élargie** — parallélisation, pas de changement d'archi.
2. **Capture des étiquettes** — une table, un endpoint, une insertion.
   Ne nécessite ni worker, ni pré-calcul.

Le fallback silencieux vers le top 3 mondial doit devenir visible : l'utilisateur
doit savoir quand la comparaison n'est pas légitime.

### v2 — cible avec ML

```mermaid
flowchart TB
    subgraph BG["Arrière-plan"]
        WK[Worker d'ingestion] --> WCL[API WCL]
        WCL --> EXT[Extraction features]
        EXT --> DB[(Base pré-calculée)]
        DB --> TRAIN[Entraînement périodique]
        TRAIN --> MOD[Modèle<br/>quelques Mo]
    end

    subgraph FG["Temps réel"]
        U[Utilisateur] --> API[API route]
        API --> DB
        API --> MOD
        MOD --> SEL["Sélection apprise<br/>+ score de confiance"]
        SEL --> CLU["Clusters d'opening"]
        CLU --> ANO["Écart à la distribution"]
        ANO --> LLM[LLM : rapport]
        LLM --> UI[UI]
        UI -.->|étiquettes| DB
    end
```

Ce qui change vraiment : le passage de « requête à la demande » à
**« pré-calcul en arrière-plan »**. La base pré-calculée est l'actif — elle sert
le ML, elle permet l'analyse instantanée d'un roster de 25 joueurs, et elle justifie
l'abonnement par une antériorité qu'un concurrent doit reconstituer.

### Coûts d'infra

| | v0 / v1 | v2 |
|---|---|---|
| Entraînement | — | Laptop ou GitHub Action, quelques secondes |
| Inférence ML | — | ~0, en mémoire |
| Inférence LLM | Tokens | Tokens |
| Stockage | ~0 | Postgres managé, quelques Go/an |
| Coût mensuel avant utilisateurs | ~0 | Quelques dizaines d'euros |

L'entraînement n'est pas le poste coûteux : données tabulaires, pas de deep learning,
pas de GPU. Le poste coûteux est le **pipeline de données**.

---

## 4. Arbre de décision

```mermaid
flowchart TD
    Q1{L'IA produit-elle<br/>de la donnée<br/>que personne d'autre n'a ?}
    Q1 -->|Non| G["Gadget<br/>→ garder pour l'UX,<br/>jamais comme argument de vente"]
    Q1 -->|Oui| Q2{Cette donnée<br/>vient-elle d'étiquettes<br/>que tu accumules ?}
    Q2 -->|Oui| S1["Actif défendable<br/>→ démarrer la capture<br/>immédiatement"]
    Q2 -->|Non| Q3{Vient-elle d'un calcul<br/>reproductible<br/>sur données publiques ?}
    Q3 -->|Oui| S2["Différenciant à court terme<br/>→ avance temporelle seulement"]
    Q3 -->|Non| S3["Vérifier l'hypothèse :<br/>d'où vient la donnée ?"]
```

---

## 5. Points ouverts

- **Conditions d'utilisation de l'API WCL** sur le stockage et la redistribution
  de données dérivées. Une app qui requête à la demande et une app qui constitue
  une base dérivée ne sont pas nécessairement traitées de la même façon.
  À vérifier avant tout investissement en v2.
- **Volume d'étiquettes nécessaire** pour que le classifieur de comparabilité
  dépasse une heuristique simple. Inconnu tant que la capture n'a pas démarré.
- **Persona payeur** — joueur individuel ou raid leader. Détermine si la vue
  roster est une feature v2 ou le produit lui-même.
