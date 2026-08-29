# LogLense

Outil d'analyse de logs World of Warcraft. Il récupère les combats d'un joueur sur
Warcraft Logs, les compare à des logs de référence, et produit un rapport de progression.

Cible : le raider confirmé qui plafonne — pas le débutant, qui gagne davantage avec un
guide statique. La comparabilité fine ne devient utile qu'une fois les gains faciles
épuisés.

## Contraintes non négociables

Elles précèdent toute décision de conception. Une proposition qui les enfreint est à
écarter, pas à aménager.

1. **Contrainte communautaire** — la communauté WoW rejette les paywalls durs sur les
   outils utilitaires (précédents Details!, WeakAuras). Un gap fonctionnel sans modèle
   de revenu acceptable n'est pas exploitable.
2. **Critère anti-gadget** — l'IA doit créer une valeur marginale qu'aucun substitut bon
   marché n'atteint. Test (reformulé le 2026-08-08, voir `ia-ml-architecture.md` §6.1) :
   remplace ton IA par le substitut le moins cher qui rende le même service — table de
   correspondance, seuils codés en dur, guide statique. L'utilisateur le remarque-t-il ?
   Part-il ?

Corollaire opérationnel : **repousser le calcul est acceptable, repousser la capture de
données ne l'est pas.** Le calcul se rattrape ; les données non capturées sont perdues.

## Règles de collaboration

- Nommer un défaut de raisonnement immédiatement et précisément. Pas de validation de
  complaisance, pas de contradiction gratuite.
- Signaler quand une piste manque de modèle de monétisation viable plutôt que de la
  laisser filer.
- Distinguer systématiquement PoC et décision de production.

## Coût et contexte

Le but n'est pas de dépenser moins, c'est de **produire plus dans une fenêtre de 5 h**. Ce
qui suit est mesuré, pas supposé : relevé `ccusage` du 24 au 27 août 2026, 123,63 $ sur huit
fenêtres, recoupé aux journaux de session bruts pour isoler les sous-agents.

**97,5 % de la dépense est la session principale.** Tous les sous-agents réunis font 2,5 %.
Le routage des agents est donc une question de justesse, pas d'économie : régler leur modèle
ne peut rien rendre au-delà de ces 2,5 %.

Dans la session principale : écriture de cache **50 %**, relecture 32 %, sortie rendue 18 %,
entrée neuve ~0 %. D'où les deux seuls chiffres qui commandent tout le reste.

**Un jeton qui entre en contexte coûte ~16 $/M, pas 5.** Il est écrit au cache une fois
(10 $/M, tarif TTL 1 h) puis relu à chaque tour suivant (0,50 $/M) — ratio lecture / écriture
mesuré : **12,8**. Ce qu'on laisse en contexte est relu treize fois. Un `pnpm test` non
filtré, ~4 000 jetons, coûte 6 centimes ; un fichier de 800 lignes lu en entier, 33 centimes.
Autant de plafond de la fenêtre consommé sans rien produire.

**À plafond égal, le rendement d'une fenêtre varie du simple au double** : de 4 200 à 9 500
jetons de sortie par dollar sur les huit relevées, pour un volume d'écriture presque
identique. L'écart ne vient pas de la difficulté des tâches mais de deux dérives symétriques
— **écrire sans amortir** (charger un gros contexte puis s'arrêter) et **amortir sans finir**
(une session si longue que chaque ajout est relu dix-sept fois). Les meilleures fenêtres
tiennent un ratio entre 10 et 13.

- **Filtrer la sortie de chaque commande.** `pnpm test` passe par
  `| grep -E "Tests |FAIL"`, un build par `| tail`. Lire les fichiers par plages
  (`sed -n`, `offset` / `limit`), jamais en entier « pour voir ».
- **Proposer les points de coupure : c'est le levier n° 1.** Je ne peux ni vider ni compacter
  le contexte moi-même — mais je dois dire quand le faire. `/clear` au changement de sujet :
  le hook `SessionStart` réinjecte l'état du dépôt, donc repartir de zéro ne coûte rien, et
  tout ce qui traînait cesse d'être refacturé à chaque tour. `/compact` seulement si la suite
  a besoin des conclusions intermédiaires — il préserve la qualité mais réécrit tout le
  contexte, donc il coûte là où `/clear` ne coûte rien. Ne jamais couper au milieu d'une
  implémentation : proposer quand une tâche se termine, avec le prompt de reprise.
- **Répartition des rôles, par défaut et sans qu'on la redemande.** La session principale
  planifie, arbitre et rédige : Opus, effort `high` — réglé une fois dans
  `~/.claude/settings.json` (`model`, `effortLevel`). L'exécution part en sous-agent, dont le
  modèle et l'effort sont épinglés dans `.claude/agents/`. Le critère de délégation n'est pas
  la difficulté mais **le volume déversé dans le transcript** : un balayage rend vingt
  fichiers qu'on refacture ensuite treize fois, un sous-agent n'en rend que la conclusion. Ce
  qui tient en dix lignes de sortie se fait en ligne — un démarrage à froid coûte plus cher
  que la tâche.
- **Choisir l'agent, pas le modèle.** Routage par type de tâche, jamais par difficulté :

  | Tâche | Agent — modèle |
  |---|---|
  | Trouver où quelque chose est traité | `scout` — Haiku |
  | Transcrire un plan qui porte déjà le code | `implementer` — Sonnet/`high` |
  | Relire un diff empaqueté contre son brief | `task-reviewer` — Sonnet/`high` |
  | Relire une branche entière, tous commits | `branch-reviewer` — Opus/`high` hérité |
  | Concevoir, arbitrer, trancher produit | session principale — Opus/`high` |
  | Déboguer une cause inconnue | en ligne — une mauvaise hypothèse coûte plus qu'un modèle |

  Ne jamais passer par `general-purpose`, `claude` ni `Explore` : aucun n'épingle son modèle,
  leur défaut est `inherit` — donc Opus — et `claude` a `tools: *`, donc un volume non borné.
  `Explore` tournait bien en Opus jusqu'au 2026-08-27, mesure à l'appui ; `scout` le remplace.

  L'effort ne se surcharge pas à l'appel : il est figé dans la définition. `task-reviewer` est
  donc en `high`, et un diff qui touche `comparability.ts`, `references.ts` ou l'un des quatre
  pipelines s'escalade vers `branch-reviewer` — pas vers un effort plus haut.
- **Une seule dispatch de revue, pas une chaîne.** Revue puis correctif puis re-revue, c'est
  trois démarrages à froid. Corriger soi-même les points mineurs et les vérifier ; ne déléguer
  que ce qui a réellement besoin d'un regard neuf.
- **Regrouper les tâches minuscules, et exécuter en ligne quand le plan porte déjà le code
  littéral.** Deux modules de dix lignes sont une tâche, pas deux : chaque lancement
  reconstruit son contexte depuis zéro. La délégation se justifie sur du jugement, jamais sur
  de la transcription.

Ce fichier est réinjecté à chaque session : l'allonger se paie sur toutes les fenêtres
suivantes. Une règle ajoutée ici doit valoir son écriture.

## Vocabulaire du domaine

| Terme | Sens |
|---|---|
| **parse** | Un combat classé sur Warcraft Logs, avec son percentile par rapport aux autres joueurs de la même spec sur le même boss |
| **bracket** | Percentile restreint à une tranche d'ilvl, plus juste qu'un percentile global |
| **ilvl** | Item level moyen de l'équipement. Corrélé au DPS, donc un axe de comparabilité |
| **set bonus** | Bonus d'ensemble à 2 ou 4 pièces. Un 2p et un 4p ne sont pas comparables. Invisible dans les rankings WCL — demande le `CombatantInfo` de chaque candidat |
| **external** | Buff offensif reçu d'un autre joueur, Power Infusion en tête. Fausse la comparaison : critère éliminatoire |
| **opening chain** | Séquence ordonnée des premiers sorts d'un combat. Non disponible aujourd'hui : les casts sont requêtés en agrégat, l'ordre est perdu à la source |
| **comparabilité** | Le cœur du produit : deux logs sont comparables si l'écart de DPS s'explique par le jeu et non par le contexte (kill time, ilvl, set bonus, externals) |
| **spec / encounter / difficulty** | Spécialisation (id numérique WCL), boss, et palier de difficulté (3 = Normal, 4 = Heroic, 5 = Mythic) |

## Carte du code

```
src/lib/wcl/
  auth.ts             OAuth client-credentials Warcraft Logs
  client.ts           gql() — un POST sur l'API v2, gestion des erreurs GraphQL
  queries.ts          Toutes les requêtes GraphQL, en constantes
  constants.ts        KILL_TIME_TOLERANCE, TOP_N — les seuils de comparabilité
  parsers.ts          Réponses WCL → types du domaine (stats, casts, uptimes)
  combatant.ts        Type CombatantEvent + recherche par acteur, par nom, par spec
  fight-data.ts       Dégâts + rotation d'un combat → stats, rotation, cibles, dps
  eligibility.ts      Set bonus et externals d'un combattant : les critères éliminatoires
  fight-context.ts    Ce qui est arrivé au raid pendant la pull (morts, wipes, durée)
  pool-cache.ts       Cache à TTL du pool de candidats — jamais un pool incomplet
  comparability.ts    Le calcul : distance d'un candidat, sélection, niveau. `references.ts`
                      en est l'appelant complet ; `cohort.ts` et `damage-gap.ts` n'en tirent
                      que des primitives (`medianOf`, `selectClosest`, `comparabilityLevel`)
  references.ts       Sélection des logs de comparaison et récupération des joueurs
  result-snapshot.ts  Le BossResult rendu, relisible 24 h — ce que le chat rejoue
  promote.ts          Un candidat du `sample` promu en référence complète : trois requêtes
  pipeline.ts         Analyse par personnage : nom → rankings → meilleur parse → rapport
  report-pipeline.ts  Analyse par rapport WCL : code + acteur → rapport
  pull-pipeline.ts    Comparaison de deux pulls du même joueur — sans références
  raid-ranking.ts     Classement des joueurs d'une pull — sans références
src/lib/comparison/
  talent-diff.ts      Écarts de build : toi seul / eux seuls / communs, avec le compte k sur n
  rotation-stats.ts   Par sort : fourchette des références, médiane, écart, tri par écart
  cohort.ts           Resélection de la cohorte sur le `sample` — zéro requête WCL
  damage-gap.ts       Par sort : ma part de dégâts, celle du champ, l'écart en dps. Le tri est
                      `|fieldDps − mineDps|` — symétrique, mesuré, dans l'unité de l'écran
  findings.ts         Les constats classés : `rankedGaps` (verdict, plancher de bruit,
                      effectif), leur cause probable, l'ouverture et le build. Un classement,
                      un filtrage, une tête — la bannière nomme cette tête-là, jamais la sienne
  leading-gap.ts      La phrase de la bannière : elle prend la tête de `rankedGaps` et ne dit
                      rien si sa cadence n'est pas nommable. Aucun classement propre
  naming-rights.ts    `isNameableGap` : quand une cadence a le droit d'être nommée. Sa seule
                      raison d'être est d'avoir deux appelants qui ne peuvent pas s'importer
src/lib/ai/
  prompt.ts           Le prompt du rapport one-shot, PROMPT_VERSION comprise
  provider.ts         Les types partagés : AIProvider, ToolCapableProvider, ChatTurn
  catalog.ts          Les fournisseurs : libellé, clé de stockage, variable d'env, outillé ou non.
                      La seule liste — route et interface la lisent toutes deux
  claude.ts gemini.ts openai.ts
                      Rapport et chat : ils implémentent `streamTurn`
  groq.ts             Rapport one-shot seulement : pas d'outils, donc pas de chat
  chat-prompt.ts      Le system prompt du chat : périmètre dégâts, refus hors périmètre
  chat-tools.ts       Les quatre outils : resélection, comparaison, promotion, refus
  chat-loop.ts        La boucle agentique — modèle, outils, tours, jusqu'à la réponse
  markdown.ts         Rendu minimal des tableaux et listes du modèle, sans dépendance
src/lib/api/
  parse.ts            Validation des corps de requête — un `as` sur `req.json()` ne vérifie rien
  response-error.ts   Ce qu'une réponse en échec dit au client, `Retry-After` compris
  wcl-guard.ts        Ce qu'un compte a le droit de dépenser chez WCL avant d'être refusé
src/lib/labels/
  corpus.ts           Écriture bornée par mois, jamais purgée : le corpus est l'actif
  record-exposure.ts  Capture de ce qui a été rendu, avec la provenance du DPS
  record-advice.ts    Capture des rapports IA rendus
  record-chat.ts      Capture d'un tour de chat : axe, outils, filtre, refus. Jamais de verbatim
  record-usage.ts     Capture du relevé de jetons d'un rendu, joint au conseil par `renderId`
  usage.ts            `UsageRecord` et sa clé de mois : entrée neuve, cache lu, cache écrit,
                      séparément. `null` dit non mesuré, jamais zéro
  rate-limit.ts       Quotas : `consumeQuota` échoue ouvert, `consumeStrictQuota` fermé
  schema.ts           Validation des soumissions entrant au corpus (plafonds de corpus)
src/lib/access.ts     Qui entre : admin → amorçage (env) → fenêtre ouverte → liste nominative
                      (Redis), et la file des refusés. Échoue fermé, `requestAccess` ne jette
                      jamais. Administré par `/admin` et `api/admin/access`
src/lib/specs.ts      Table des specs (id → nom de spec et de classe)
src/lib/redis.ts      Upstash en REST — seule persistance existante. GET, SET, SETEX,
                      INCRBY, EXPIRE, LLEN, RPUSH, HGET, HSET, HDEL, HLEN, HGETALL. Un refus
                      jette, il ne rend pas `undefined`
src/data/talents/     Arbres de talents par spec, générés par scripts/
src/components/ui/    Les primitives : Button, Card, Input, Select, Tabs, ScrollArea,
                      Sheet, Badge, BackLink, ErrorBanner, LoadingSpinner, ProgressSteps
src/components/admin/  AccessAdmin : la porte, la file, les membres. Sa page et sa route répondent
                      404 à un non-admin — un 403 confirmerait la liste
```

Tous les modules de `comparison/` sont des fonctions pures, testables sans rendu. Ils sont
séparés des composants parce que le sous-projet 3 les réutilisera quand les références
passeront de trois exemplaires à une distribution.

## Les quatre pipelines

`pipeline.ts` et `report-pipeline.ts` sont deux vues du même chemin. Ils ne diffèrent que sur
deux points : **comment le sujet analysé est trouvé** (nom de personnage → rankings →
meilleur parse, contre `code` + `actorId` déjà fournis) et **d'où viennent les percentiles**
(`encounterRankings` contre `report.rankings`). Tout le reste passe par `combatant`,
`fight-data` et `references`.

Les deux autres ne passent pas par `references.ts` du tout :

- `pull-pipeline.ts` compare deux pulls **du même joueur** : le sujet est sa propre
  référence, il n'y a pas de vivier à résoudre. Les critères de comparabilité y sont portés
  (`eligibility` et `context` sur chaque instantané) et **affichés**, pas utilisés pour
  sélectionner.
- `raid-ranking.ts` classe les joueurs d'**une seule pull**, sur le percentile WCL ou sur le
  DPS brut en repli. C'est un autre axe, nommé à l'écran par `criterionReason`.

**Corollaire** : une évolution de la comparabilité — rendre le fallback visible, filtrer sur
l'ilvl ou le set bonus, paralléliser, passer à une distribution — s'écrit dans `references.ts`
et `comparability.ts`, jamais dans `pipeline.ts` ni `report-pipeline.ts`. **Mais elle
n'atteindra que deux écrans sur quatre.** Les deux autres ne bougeront pas, et rien ne le
signalera : qui durcit la comparabilité doit trancher explicitement, pipeline par pipeline,
si la règle s'y applique — et l'écrire ici.

Faire converger les quatre n'est pas au programme : `PRODUCT_CONTEXT.md` §5 acte qu'il n'y a
pas davantage de travail de comparabilité à faire. Cette section dit donc l'état réel, pour
qu'on ne s'appuie pas sur une garantie qui n'existe pas.

### Arbitrages déjà tranchés

**Mort précoce du sujet** (`EARLY_DEATH_TOLERANCE`, `earlyDeathPctOf`) — un sujet mort avant
80 % de sa pull couvre une fenêtre de dégâts plus courte que celle des références, et le bandeau
le dit. Le niveau de comparabilité ne bouge pas : il mesure la distance de la cohorte, pas
l'amputation du sujet.

| Pipeline | Décision |
|---|---|
| `pipeline.ts` | Oui — `context` déjà récupéré, bandeau rendu |
| `report-pipeline.ts` | Oui — idem |
| `pull-pipeline.ts` | Non — il affiche déjà les morts via `PullContextCard`, et ne compare pas à une cohorte |
| `raid-ranking.ts` | Non — il ne récupère pas `context`, l'ajouter coûterait une requête par pull |

## Le chat

Le différenciateur, et la seule partie outillée du produit. Il relit l'instantané du
`BossResult` (`result-snapshot.ts`, 24 h) et rejoue la cohorte à la demande. Quatre invariants,
tous portés par `src/app/api/chat/route.ts` :

- **La session est exigée pour toute requête, BYOK comprise.** Une clé personnelle achète le
  modèle, pas le droit de lire nos données dérivées de Warcraft Logs. Le rapport, lui, laisse
  passer qui apporte sa clé — son corps porte déjà l'analyse.
- **Le client désigne l'instantané, il ne le nomme pas.** La clé Redis se reforme côté serveur
  depuis royaume / personnage / rencontre. Accepter une clé toute faite laisserait lire le cache
  d'un autre joueur.
- **La resélection est gratuite, la promotion s'annonce.** `cohort.ts` rejoue `scoreCandidate`,
  `selectClosest` et `comparabilityLevel` sans une requête ; `promote.ts` en coûte trois, passe
  par `wcl-guard` et le dit avant de dépenser.
- **Le refus hors périmètre est la position produit**, pas une limite subie : ni survie, ni
  défensives, ni mécaniques de boss que nous ne voyons pas.

Le chat exige `ToolCapableProvider` (`streamTurn`) et non `AIProvider` : un fournisseur sans
outils est refusé à la compilation, jamais au premier appel d'outil ignoré. Claude, Gemini et
OpenAI le servent ; Groq reste au rapport. La liste admissible est `CHAT_PROVIDERS` — le chat
choisit son fournisseur sous sa propre clé de stockage, sinon un rapport laissé sur Groq
ouvrirait le chat sur un fournisseur que la route refuse en 400.

## Interface : tokens et primitives

**Aucun `style={{}}` dans les composants.** Trois exceptions, toutes des géométries calculées
à l'exécution : la largeur des barres dans `DamageBreakdown` et `TalentDiff`, la position de
la bande et du marqueur dans `RotationCards`. `TrajectoryChart` montre l'alternative quand
elle existe : la géométrie passe par des attributs SVG, pas par un style en ligne.

Les couleurs, tailles, rayons et points de rupture sont déclarés une fois dans
`src/app/globals.css`, dans un bloc `@theme` Tailwind v4, et consommés uniquement par des
classes utilitaires. Aucune valeur littérale de couleur, d'espacement, de taille de police
ou de rayon ne doit apparaître dans un composant.

Trois règles qui ont chacune coûté une ronde de correction :

- **Le rouge (`text-danger`) est réservé aux erreurs.** Un écart par rapport aux références
  s'affiche en bleu (`text-deviation`) : une position dans une distribution n'est pas une
  faute. Le rouge doit rester disponible pour signaler une comparaison illégitime.
- **Tous les chiffres sont en `font-mono`**, y compris à l'intérieur d'une phrase — on
  enveloppe alors le nombre, pas la phrase. Seul le corps du rapport IA fait exception :
  c'est de la prose, il est en `font-sans`.
- **On ne surcharge jamais la taille d'une primitive via son `className`.** Tailwind
  départage deux utilitaires agissant sur la même propriété par leur ordre dans la feuille
  générée, pas par leur position dans la chaîne : la surcharge est silencieusement ignorée.
  Si aucune taille existante ne convient, on étend la primitive.

`Sheet` est le traitement mobile des colonnes latérales : il rend ses enfants directement à
partir de `md`, et derrière un déclencheur plus un panneau glissant en dessous. L'envelopper
suffit — pas de media query à écrire.

## Vérification

Les quatre doivent passer avant tout commit. Le hook pre-commit les exécute.

```
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
```

## Contexte produit

`PRODUCT_CONTEXT.md` est la revue produit et marché, refaite de zéro le 2026-08-22 : paysage
concurrentiel, capacité réelle à acquérir des joueurs, modèle de pass de saison individuel et
guilde, décisions closes et ordre des travaux ouverts. Il ne contient plus de technique —
celle-ci vit dans `docs/`. Les documents de `docs/superpowers/` qui renvoient à ses anciennes
sections numérotées pointent vers la version précédente et n'ont pas été réécrits.

`ia-ml-architecture.md` complète le cadrage côté technique : distinction IA gadget /
structurante, familles de modèles, et les architectures v0 / v1 / v2 en diagrammes.

Les lire avant toute décision qui engage la direction du produit — nouvelle feature,
découpage gratuit/payant, choix d'architecture. Inutiles pour une correction localisée.
