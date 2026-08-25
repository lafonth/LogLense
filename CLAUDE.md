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

Ces règles s'appliquent en permanence, y compris après un `/clear`. Elles viennent d'un
relevé de consommation réel : la dépense vient des sous-agents lancés, du volume brut
laissé en contexte, et de la durée d'une session avant compaction.

- **Filtrer la sortie de chaque commande.** `pnpm test` passe par
  `| grep -E "Tests |FAIL"`, un build par `| tail`. Un dump complet de vitest fait des
  centaines de lignes qui restent en contexte et sont relues à chaque tour suivant.
- **Répartition des rôles, par défaut et sans qu'on la redemande.** La session principale
  planifie, arbitre et rédige : Opus, effort `high` — réglé une fois dans
  `~/.claude/settings.json` (`model`, `effortLevel`). L'exécution part en sous-agent, dont
  le modèle et l'effort sont épinglés dans `.claude/agents/`. Le critère de délégation
  n'est pas la difficulté de la tâche mais **le volume qu'elle déverse dans le
  transcript** : lectures multiples, sorties de tests, édition sur plusieurs fichiers. Ce
  qui tient en dix lignes de sortie se fait en ligne — un démarrage à froid coûte plus
  cher que la tâche.
- **La recherche ne se fait pas dans le transcript principal.** Un `grep` qui ramène vingt
  fichiers coûte, à chaque tour suivant, le prix de sa relecture en Opus. Trois lectures
  ciblées passent en ligne ; un balayage passe par `Explore`, qui tourne en Haiku et ne
  rend que sa conclusion. C'est l'économie la plus rentable du dispositif : elle ne retire
  rien à la qualité de ce qui est décidé ensuite.
- **Choisir l'agent, pas le modèle.** Les définitions de `.claude/agents/` épinglent le
  modèle **et l'effort**. Le routage se fait par type de tâche, jamais par difficulté :

  | Tâche | Agent — modèle |
  |---|---|
  | Trouver où quelque chose est traité | `Explore` — Haiku |
  | Transcrire un plan qui porte déjà le code | `implementer` — Sonnet/`high` |
  | Relire un diff empaqueté contre son brief | `task-reviewer` — Sonnet/`xhigh` |
  | Relire une branche entière, tous commits | `branch-reviewer` — Opus/`high` hérité |
  | Concevoir, arbitrer, trancher produit | session principale — Opus/`high` |
  | Déboguer une cause inconnue | en ligne — une mauvaise hypothèse coûte plus qu'un modèle |

  Un palier plus bas ne fait économiser que s'il réussit du premier coup : une passe de
  correction rejoue tout le contexte et annule l'écart. `xhigh` sur Opus reste le poste le
  plus cher du dispositif. Ne jamais passer par `general-purpose` ni `claude` : leur défaut
  est `inherit` — donc Opus — et `claude` a `tools: *`, donc un volume non borné.
- **Une seule dispatch de revue, pas une chaîne.** Revue puis correctif puis re-revue,
  c'est trois démarrages à froid. Corriger soi-même les points mineurs et les vérifier ;
  ne déléguer que ce qui a réellement besoin d'un regard neuf.
- **Regrouper les tâches minuscules.** Deux modules de fonctions pures de dix lignes sont
  une tâche, pas deux : chaque lancement reconstruit son contexte depuis zéro.
- **Exécuter en ligne quand le plan contient le code littéral.** La délégation se justifie
  sur du jugement, pas sur de la transcription.
- **Proposer explicitement les points de coupure.** Je ne peux ni compacter ni vider le
  contexte moi-même — mais je dois dire quand le faire. `/clear` au changement de sujet,
  c'est le cas courant et le moins cher : le hook `SessionStart` réinjecte l'état du
  dépôt, donc repartir de zéro ne coûte rien. `/compact` seulement si la suite a besoin
  des conclusions intermédiaires. Toujours proposer un prochain prompt post clear/compact. Make sure that compact is not better than clear in order to have the best ratio between token saving and quality of the output thanks to context. The idea is not to disrupt the flow of implementation neither, propose when it's really necessary. 

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
  comparability.ts    Le calcul : distance d'un candidat, sélection, niveau. Importé par
                      references.ts seul
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
  rate-limit.ts       Quotas : `consumeQuota` échoue ouvert, `consumeStrictQuota` fermé
  schema.ts           Validation des soumissions entrant au corpus (plafonds de corpus)
src/lib/specs.ts      Table des specs (id → nom de spec et de classe)
src/lib/redis.ts      Upstash en REST — seule persistance existante. GET, SET, SETEX,
                      INCRBY, EXPIRE, LLEN, RPUSH. Un refus jette, il ne rend pas `undefined`
src/data/talents/     Arbres de talents par spec, générés par scripts/
src/components/ui/    Les primitives : Button, Card, Input, Select, Tabs, ScrollArea,
                      Sheet, Badge, BackLink, ErrorBanner, LoadingSpinner, ProgressSteps
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
