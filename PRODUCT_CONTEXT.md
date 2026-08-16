# PRODUCT_CONTEXT.md

Base de connaissance produit pour LogLense.
Issue d'une session de cadrage produit (phase d'extraction des frictions).

**Statut de ce document** : les constats sur le code ont été vérifiés contre le working
tree le 2026-08-03 (commit `6989056`). Voir la section 7 et le rapport complet dans
[docs/superpowers/specs/2026-08-03-audit-pipeline-wcl.md](docs/superpowers/specs/2026-08-03-audit-pipeline-wcl.md).
La **section 8** a été rouverte et revérifiée le 2026-08-16 : elle n'est plus un ordre des
travaux mais l'inventaire de ce qui tourne.

**Autorité** : ce document fait autorité sur les décisions produit. Le code fait autorité
sur les constats techniques.

---

## 1. Contexte

Développeur solo, ingénieur senior full stack. Side project.
Joueur Feral Druid, guilde mid-core francophone, 25 joueurs, 2 soirs de raid par
semaine (3 h par session), M+ régulier.

Objectif : construire un outil monétisable pour l'écosystème WoW, où l'IA est
**structurante** et non ajoutée.

Deux contraintes non négociables, définies en amont du projet :

1. **Contrainte communautaire** — la communauté WoW rejette historiquement les
   paywalls durs sur les outils utilitaires (précédents Details!, WeakAuras).
   Un gap fonctionnel sans modèle de revenu acceptable n'est pas exploitable.
2. **Critère anti-gadget** — l'IA doit créer une valeur marginale qu'aucun substitut bon
   marché n'atteint. Test (reformulé le 2026-08-08, voir
   [ia-ml-architecture.md](ia-ml-architecture.md) §6.1) : *remplace ton IA par le
   substitut le moins cher qui rende le même service — table de correspondance, seuils
   codés en dur, guide statique. L'utilisateur le remarque-t-il ? Part-il ?*

---

## 2. La friction centrale

Formulée par l'utilisateur, revenue spontanément dans deux catégories distinctes
(préparation de raid **et** post-mortem) — c'est le signal le plus fort de la session.

> Trouver des logs **comparables** pour établir un benchmark légitime, puis
> comparer sur 5 axes.

**Les 5 axes de comparaison** :
DPS · répartition des dégâts par sort · **opening spell chain** · usage des CD
offensifs et défensifs · build de talents.

**Les critères de comparabilité** (extraits difficilement — l'utilisateur ne les
avait jamais explicités) :

| Critère | Nature | Disponibilité |
|---|---|---|
| Absence d'externals reçus (Power Infusion notamment) | Éliminatoire | Les buffs des candidats sont **déjà récupérés** par `Q_ROTATION` et ignorés — voir D5 de l'audit |
| Même palier de set bonus (2p ≠ 4p) | Éliminatoire | **Invisible dans les rankings WCL** — requiert CombatantInfo par candidat |
| ilvl proche | Pondérable | Calculable, et déjà calculé |
| Kill time proche | Pondérable | Disponible dans les rankings |

**Point de design critique** : l'utilisateur ne compare pas à *un* log de
référence. Il regarde **plusieurs logs pour dégager une tendance** de builds et
de répartition de stats. Ce n'est pas un raffinement d'une comparaison 1-à-1 —
c'est un produit différent : *« où se situe mon build dans la distribution des
joueurs comparables »* plutôt que *« voici le meilleur joueur, copie-le »*.

**Nature du besoin** : accélérer une **boucle d'apprentissage**, pas produire un
rapport ponctuel. Implique de la progression dans le temps — angle que WCL ne
prend pas (WCL donne un état, jamais une trajectoire).

Besoin stable depuis toujours, pas conjoncturel à une extension.

---

## 3. Tableau des frictions

| # | Friction | Statut |
|---|---|---|
| 1 | Sélection de logs comparables | **Non défini** — trié à la main, aucun outil |
| 2 | Comparaison sur 5 axes | **Couvert** — 5/5 depuis le 2026-08-06, l'opening chain incluse |
| 3 | Plan de CD qui casse (comp non optimisée) | Structurel, pas un gap produit |
| 4 | Dépôt centralisé de routes M+ guilde | **Écarté** — stockage de strings MDT, ne justifie pas un service payant |
| 5 | Décisions en combat | Couvert (addons in-game) |
| 6 | Roster / recrutement | Couvert (outil centralisé existant) |
| 7 | Communication de strat | Couvert (MythicTrap + screenshots manuels du RL) |

Aucune friction M+ pure n'est ressortie malgré un profil M+ régulier. Le raid
concentre 6/7 des frictions.

---

## 4. Validation marché (état réel)

Sondage Discord de guilde, échantillon ~25 raiders :

- ✅ **Douleur validée** — tout le monde consulte les logs régulièrement, tout le
  monde trouve le processus lent.
- ⚠️ **Consentement à payer non validé** — réponse majoritaire : intéressé mais
  pas pour un abonnement supplémentaire. Une minorité non chiffrée paierait
  quand même. **Le chiffre exact manque.**
- 💡 **Piste retenue** — abonnement **saisonnier de guilde**.

**Pourquoi l'abonnement saisonnier de guilde** : il résout deux problèmes d'un coup.

1. *Saisonnalité* — l'usage est intense en début de tier puis décroît. Un
   abonnement mensuel classique subit un churn structurel en semaine 4 que la
   qualité du produit ne peut pas corriger.
2. *Objection « un abonnement de plus »* — le RL paie une fois, 25 joueurs
   accèdent, le coût perçu individuel disparaît.

**Conséquence sur la nature du produit** : si l'acheteur est la guilde, la valeur
n'est plus « optimise mon Feral » mais **« où sont les 5 joueurs de mon roster
avec le plus de marge de progression, et sur quoi »**. Le besoin individuel
devient un cas particulier.

**Séquencement décidé** :
construire le moteur individuel d'abord — c'est la brique commune, la vue roster
n'étant que N analyses agrégées — mais **le traiter comme une phase de validation
qualité, pas comme le produit à vendre**. Les joueurs individuels sont les plus
exigeants sur la justesse des conseils, donc le meilleur banc d'essai.

**Risque identifié** : si le gratuit individuel est excellent, il devient *le*
produit dans la perception des utilisateurs et la couche payante ressemble à une
rançon. La valeur RL doit être **d'une autre nature** (priorisation à l'échelle du
roster, détection de qui progresse ou stagne, comparaison inter-joueurs) — jamais
une version débloquée du même écran.

**Persona** : joueur **confirmé qui plafonne**, pas la pyramide entière. Un
débutant gagne 20 % de DPS avec un guide statique ; la comparabilité fine ne
devient utile qu'une fois les gains faciles épuisés.

---

## 5. Principe directeur : IA structurante

Note d'architecture complémentaire, avec les diagrammes de flux v0 / v1 / v2 et l'arbre
de décision gadget / structurant : [ia-ml-architecture.md](ia-ml-architecture.md).

> ~~**Divergence à trancher**~~ — **close le 2026-08-07.** La section 5 de cette note
> laissait le persona payeur ouvert ; elle renvoie désormais à la section 4 ci-dessus,
> qui fait autorité : abonnement saisonnier de guilde, donc le raid leader.

### Le découpage de monétisation

**Ne pas faire** : « données structurées gratuites, rapport IA payant ».
Ce modèle offre gratuitement ce qui coûte cher à construire (pull, structuration,
comparabilité) et fait payer ce qui coûte cher à servir (tokens) tout en étant
réplicable en un week-end. Il maximise les coûts des deux côtés.

**Ne pas faire non plus** : 100 % abonnement dès le départ. Aucune acquisition,
aucun bouche-à-oreille, collision frontale avec la contrainte communautaire.

**Faire** : découpage **réplicable / défendable**.

| Gratuit | Payant |
|---|---|
| Vue d'un log, rapport ponctuel — ce que WCL donne déjà | Comparabilité apprise, historique de progression, clusters d'opening, vue roster |

### Où l'IA a de la valeur, par ordre de défendabilité

1. **Sélection de logs comparables** *(le plus défendable)* — apprentissage
   supervisé sur les exclusions de l'utilisateur. Signal d'entraînement bon marché
   (un clic), entrée riche (CombatantInfo complet). WCL ne le fera pas : WCL vend
   des classements, pas de la comparabilité.
2. **Reconnaissance de patterns d'opening** — clustering non supervisé de
   séquences de casts. Impossible à coder proprement en règles. Axe le plus mal
   servi par le marché existant.
3. **Détection d'anomalies sans seuils** — écart par rapport à une distribution
   plutôt qu'à un chiffre codé en dur. Structurant mais réplicable (c'est de la stat).
4. **Rédaction du rapport en langage naturel** — utile pour l'UX, **zéro
   défendabilité**, jamais un argument de vente.

Point commun de 1 à 3 : l'IA travaille sur la donnée **avant** l'utilisateur.

### L'actif

**L'algorithme n'est jamais l'actif** — scikit-learn est public.
**L'actif est le jeu de données étiqueté** : les décisions accumulées
« comparable / pas comparable ». Personne ne peut les copier.

> **Règle opérationnelle : repousse le calcul, jamais la capture.**
> Le calcul se rattrape en une semaine. Les données non capturées sont perdues
> définitivement.

### Pourquoi pas « Claude + skills spécialisées »

Approche envisagée puis écartée. Trois raisons :

1. **Dérive maximale** — une skill est de la connaissance métier écrite à la main,
   à réécrire à chaque tier, × 39 specs. Maintenance de prose, non testable.
2. **Vide quand le besoin est maximal** — en semaine 1 d'un tier, la connaissance
   experte n'existe pas encore. Personne ne sait quel build est optimal. Les logs
   sont la seule source de vérité disponible.
3. **Redistribution de gratuit** — dès qu'un guide existe, l'outil ne fait que le
   relayer.

Par contraste : les features de comparabilité sont **structurelles** (écart de kill
time, ilvl, set bonus, externals) — une PI reste une PI à chaque extension. Et le
clustering non supervisé **se répare tout seul** en relançant sur les nouveaux logs.

Conservé comme bootstrap rapide pour valider l'UX et le format des conseils sur une
spec. Jamais comme actif.

---

## 6. Architecture cible

### v1 — court terme, reste synchrone

Le worker et la base pré-calculée sont de l'over-engineering pour un produit non
validé. Deux ajouts seulement :

1. **Élargir la fenêtre de candidats** (3 → 40+) par parallélisation.
   Pas de changement d'architecture.
2. **Capturer les étiquettes** — bouton « pas comparable » + log de la raison.
   Une table, un endpoint, une insertion. Ne nécessite ni worker, ni pré-calcul,
   ni ML. **À faire même si l'entraînement n'arrive que dans un an.**
   *Réserve issue de l'audit (D2) : aucun stockage relationnel n'existe
   aujourd'hui, le choix d'une base précède cette tâche.*

Plus : rendre visible le niveau de confiance de la comparaison.

### v2 — avec ML

Passage de « requête à la demande » à **pré-calcul en arrière-plan** : worker
d'ingestion → extraction de features → base → entraînement périodique. Le front lit
une base déjà remplie.

La base pré-calculée **est** l'actif : elle sert le ML, permet l'analyse instantanée
d'un roster de 25 joueurs, et justifie l'abonnement par une antériorité qu'un
concurrent doit reconstituer.

Coûts : l'entraînement est négligeable (données tabulaires, pas de deep learning,
pas de GPU — scikit-learn sur laptop ou en CI). Le poste coûteux est le pipeline de
données : quelques dizaines d'euros/mois avant le premier utilisateur, contre ~0
aujourd'hui en stateless.

---

## 7. Constats sur le code — vérifiés le 2026-08-03

Rapport complet : [docs/superpowers/specs/2026-08-03-audit-pipeline-wcl.md](docs/superpowers/specs/2026-08-03-audit-pipeline-wcl.md).

### Constats confirmés

| # | Constat | Localisation réelle |
|---|---|---|
| C1 | `KILL_TIME_TOLERANCE = 0.2` et `TOP_N = 3` en constantes | `src/lib/wcl/constants.ts:23-24` |
| ~~C2~~ | ~~**Fallback silencieux**~~ — **clos le 2026-08-06.** Voir « Constats clos » ci-dessous | — |
| ~~C3~~ | ~~La requête world rankings ne pagine pas~~ — **clos le 2026-08-06.** Le filtrage reste par `specName` / `className` seuls, mais l'univers n'est plus plafonné à la première page | — |
| ~~C5~~ | ~~L'ordre temporel est perdu à la source~~ — **clos le 2026-08-06.** `events(dataType: Casts)` s'ajoute au tableau agrégé, qui reste la source des fréquences. Voir « Constats clos » ci-dessous | — |
| ~~C6~~ | ~~Boucle séquentielle sur les logs de référence~~ — **clos le 2026-08-06.** La fenêtre de vérification est parallèle, et la récupération des références retenues avec elle | — |
| ~~C8~~ | ~~`legacy/` (12 scripts Python) et `prototypes/` (4 maquettes HTML)~~ — **clos le 2026-08-07.** Les deux dossiers sont supprimés, et avec eux les exclusions devenues sans objet dans `tsconfig.json`, `eslint.config.mjs`, `.prettierignore` et `.gitignore`. L'historique git reste la trace du portage ; les plans de phase 2 et 5 dans `docs/superpowers/plans/` continuent de les citer, ce sont des archives, pas des références actives | — |

### Constats corrigés

- **C4 — partiellement exact.** `avgIlvl` est bien calculé (`src/lib/wcl/parsers.ts:31-34`)
  et **il est utilisé** : affiché dans l'UI et injecté dans le prompt IA. Il n'était
  inutilisé que pour **la sélection des candidats** — ce dernier point est clos, voir
  ci-dessous.
- **C7 — corrigé.** `CLAUDE.md` contient désormais le contexte projet et le vocabulaire
  du domaine, et ne charge plus les skills par `@`-import.

### Constats clos le 2026-08-06 — comparabilité légitime et visible

Spec : [docs/superpowers/specs/2026-08-05-comparabilite-legitime-design.md](docs/superpowers/specs/2026-08-05-comparabilite-legitime-design.md).

- **C2 — clos.** Le repli silencieux n'existe plus. `selectReferencePool` classe désormais
  tous les candidats par une distance de comparabilité et remonte le niveau atteint ;
  `BossResult.comparability` le porte, et `ComparabilityBanner` l'énonce au-dessus de la
  comparaison, avec les écarts **signés** d'ilvl et de kill time. `text-danger` sert enfin
  à ce pour quoi il était réservé : signaler une comparaison illégitime.
- **C3 — clos.** `Q_WORLD_RANKINGS` accepte `page` et le vivier est constitué des
  `CANDIDATE_PAGES = 10` premières pages, récupérées **en parallèle**. Une page en échec
  n'annule pas les autres et `pagesFetched` le remonte à l'écran.
- **C4 — clos pour la sélection.** L'ilvl entre dans le score, via `bracketData`, que
  la réponse WCL portait déjà et que le code ne lisait pas.

**L'effet mesuré**, sur le cas qui avait servi à établir le défaut — Jumbaa, Feral,
Vorasius mythique, ilvl 284,1 :

| | Avant | Après |
|---|---|---|
| ilvl des références | 292,1 · 292,7 · 292,7 | 284,7 · 285,9 · 285,1 |
| Écart d'ilvl | +8 | +0,9 |
| DPS des références | 158–164 k | 123–134 k |
| Écart de DPS présenté | ~55 k | ~25 k |
| Latence, chemin personnage | 5,3 s | 8,0 s |

**Plus de la moitié de ce qui était présenté au joueur comme son retard venait de
l'équipement des références.** Les deux chemins d'analyse rendent désormais un bloc
`comparability` identique pour le même combat.

Ce que ce chantier n'a pas traité — les critères éliminatoires — a été repris le même
jour : voir « Critères éliminatoires » ci-dessous.

### Critères éliminatoires, clos le 2026-08-06 — et C6 avec eux

Le vivier est toujours classé par distance, mais **les candidats les plus proches sont
maintenant vérifiés avant d'être retenus**. `resolveReferences` score l'ensemble du
vivier, vérifie **en parallèle** les `VERIFICATION_WINDOW = 12` premiers — un
`CombatantInfo` pour le palier de set, une table de buffs pour les externals reçus — puis
ne paie dégâts et rotation que pour les survivants. La boucle séquentielle sur les
références (C6) disparaît par construction : il n'y a plus de boucle, il y a une fenêtre
de vérification parallèle.

`src/lib/wcl/eligibility.ts` porte les deux critères, en fonctions pures :

- **Palier de set** — déduit du `setID` majoritaire de l'équipement, sans requête
  supplémentaire. Un palier inconnu (équipement vide) vaut `null` et n'élimine jamais.
- **Externals** — appariés **par guid**, jamais par nom : les noms sont localisés. PI
  10060, Ebon Might 395152, Prescience 410089, Shifting Sands 413984.

**La règle est asymétrique, et c'est le point** : on n'écarte une référence que si elle a
été *plus aidée* que le joueur — palier de set supérieur, ou uptime d'external supérieure
au-delà de `EXTERNAL_TOLERANCE`. Une référence moins bien dotée reste comparable : l'écart
qu'elle montre est alors un plancher, pas un mirage.

**Quand moins de `TOP_N` candidats qualifient**, le panneau est complété avec les
meilleurs éliminés — mais le repli se dénonce : `comparability.level` tombe à `poor`,
`substituted` compte les repêchés, la bannière l'énonce en rouge, et chaque référence
concernée est marquée « Kept without qualifying » avec sa raison. C'est un repli, mais
jamais un repli **silencieux** : la leçon de C2 tient.

Le corpus d'étiquettes passe en `v: 2` — un verdict « set-bonus » est illisible sans le
palier des deux côtés. Les enregistrements v1 n'ont pas ces champs à `null` : ils ne les
ont pas mesurés.

### D2 clos le 2026-08-06 — et sa prémisse était fausse

Plan : [docs/superpowers/plans/2026-08-06-capture-etiquettes.md](docs/superpowers/plans/2026-08-06-capture-etiquettes.md).

D2 affirmait que « la capture d'étiquettes n'a pas de substrat ». C'est faux depuis
qu'un `ReferenceLabels` poste sur `/api/labels/comparability`, qui `RPUSH` dans une liste
mensuelle `labels:comparability:<YYYY-MM>`.

Mais la formulation était déjà fausse quand elle a été écrite. `redis.ts` n'était pas un
magasin à usage unique : c'était un client générique, et lui ajouter un `RPUSH` a coûté
quelques lignes. Le vrai verrou n'était pas le stockage, il était en amont — **le code ne
savait pas de quel log venait une référence.** Sans `code`, `fightID`, `ilvl` et
`killTimeMs` par référence, une étiquette « pas comparable » n'aurait désigné rien de
réidentifiable. La provenance a dû être portée jusqu'à l'écran (commit `39f5549`) avant
que la capture ait un sens. Attribuer un blocage à l'infrastructure alors qu'il tenait à
un manque d'information dans le modèle de données a retardé la tâche la plus
irréversible de la liste.

### C5 clos le 2026-08-06 — l'ordre, là où l'agrégat ne dit rien

`table(dataType: Casts)` compte les sorts ; il ne dit pas dans quel ordre ils sont
lancés. Deux ouvertures identiques en fréquences peuvent diverger au premier bouton, et
c'est précisément la faute que le joueur qui plafonne ne voit plus. `Q_CAST_EVENTS`
interroge `events(dataType: Casts, limit: OPENING_LENGTH)` : les événements sortent
depuis le début du combat, donc **la première page *est* l'ouverture** — aucune
pagination à écrire.

Trois décisions portent le reste :

- **Le nommage est gratuit.** Les événements ne portent qu'un `abilityGameID` ; les noms
  viennent des paires `guid` → `name` du tableau agrégé, déjà payé. Zéro requête
  supplémentaire pour nommer la chaîne.
- **Les offsets partent du premier cast, pas du pull.** Réagir lentement au décompte
  n'est pas une faute de rotation. Les `begincast` sont écartés : un canalisé
  apparaîtrait deux fois.
- **Seule la première divergence est un constat.** Tous les rangs suivants sont décalés
  par elle ; les énumérer inventerait des fautes. `diffOpening` ne remonte donc que
  `firstDivergence`, et le prompt l'impose au modèle.

L'ouverture est **un axe, pas une dépendance** : la requête est en `.catch(() => null)`
et `opening: []` est un état « inconnu » déclaré, que l'écran et le prompt énoncent au
lieu de le masquer. Un échec de cette requête coûte l'axe, jamais le rapport.

### Divergences non prévues par le snapshot

| # | Divergence |
|---|---|
| ~~D1~~ | ~~**Le pipeline existe en deux exemplaires**~~ — **clos le 2026-08-03**, comme l'annonce le préalable de la section 8. `combatant.ts`, `fight-data.ts` et `references.ts` portent le traitement commun ; les deux pipelines ne diffèrent plus que sur la façon dont le sujet est trouvé et sur l'origine des percentiles |
| ~~D2~~ | ~~**Aucune base de données** — la capture d'étiquettes n'a pas de substrat~~ — **clos le 2026-08-06.** Voir ci-dessous : la prémisse était fausse dès l'écriture |
| ~~D3~~ | ~~**Le joueur de référence est apparié par spec, pas par nom**~~ — **clos le 2026-08-06.** `fetchReferencePlayers` apparie par nom ; un candidat non identifiable est écarté, jamais remplacé par un autre joueur. `findCombatantBySpecId` est supprimé |
| ~~D4~~ | ~~**Le chemin nominal ne produit pas une distribution**~~ — **clos le 2026-08-06.** `BossResult.sample` porte toute la fenêtre vérifiée : stats et talents se lisent en min / médiane / max / percentile sur cet effectif. `topPlayers` reste à `TOP_N` pour dégâts et rotation, qui coûtent une requête par référence — et l'écran comme le prompt disent lequel des deux effectifs porte quel tableau |
| ~~D5~~ | ~~**Les externals sont déjà à portée**~~ — **clos le 2026-08-06.** Les buffs sont désormais requêtés pour la fenêtre de vérification et appariés par guid ; une PI reçue au-delà de la tolérance élimine le candidat |
| ~~D6~~ | ~~**Le spec-agnosticisme reste ouvert côté prompt IA**~~ — **clos le 2026-08-08.** La spec est détectée depuis le `CombatantInfo` et `src/data/talents/` couvre de nombreuses specs ; le prompt la nomme depuis `getSpecInfo` au lieu de la laisser deviner, et dit explicitement quand elle est inconnue. Aucun sort ni aucune spec n'y est codé en dur |

**Gravité produit de C2** — pourquoi il a été traité en premier : c'était le défaut le
plus coûteux. Il reproduisait exactement la comparaison illégitime que l'outil est censé
éviter, et l'utilisateur ne pouvait pas distinguer un rapport fiable d'un rapport
trompeur. Il cassait la confiance précisément quand l'outil se trompait.

Le même défaut existait ailleurs, sous une autre forme : le percentile affiché ne mesurait
pas la même chose selon le chemin d'analyse — sous un seul libellé, deux nombres.
**Clos le 2026-08-07**, après mesure contre l'API et non contre l'intuition. Sur le même
kill, au même DPS au millième près : 60,9 % par le chemin personnage, 55,0 % par le chemin
rapport. L'hypothèse de départ — « meilleur parse contre combat demandé » — était fausse.
La cause est un homonyme dans l'API : `characterData…encounterRankings.rankPercent` est le
percentile **verrouillé** au moment du kill (353 parses de la partition), tandis que
`report.rankings…rankPercent`, du même nom, est le percentile **du jour** recalculé contre
la population courante (7 695 parses). Le nombre que le raider cite est le premier ; le
chemin rapport lit désormais le parse historique du personnage, apparié sur `code` **et**
`fightID` (`historical-parse.ts`), et dégrade vers le percentile du jour si la
réconciliation échoue.

La même mesure a levé un défaut latent : l'entrée de `report.rankings` ne porte ni
`todayPercent` ni `rankTotalParses`. `todayPct` valait donc `NaN` — sans conséquence
visible, faute de consommateur — et `overallPctOf` valait toujours `null`, ce qui privait
le percentile affiché de son effectif.

**Sur ±20 %** : sur un kill de 5 min, c'est ±60 s. Le kill time et le DPS sont
mécaniquement corrélés (moins de phases, plus d'uptime CD). Se comparer à un kill
20 % plus rapide, c'est attribuer à son gameplay un écart structurel.

---

## 8. Ce qui tourne — inventaire au 2026-08-16

**Cette section était un ordre des travaux ; elle ne l'est plus.** Écrite le 2026-08-03,
elle listait onze tâches sur le moteur d'analyse individuelle, classées par valeur. Sept
sont faites, trois sont abandonnées, une seule reste ouverte — et celle-là est conditionnée
à une infra qui n'existe pas. La lire comme une feuille de route, c'est donc se tromper
deux fois : sur ce qu'il reste à faire, et sur ce que le produit est devenu.

Car le dépôt livre depuis longtemps ce qu'aucune des onze n'énumère. La couche de compte
est **antérieure** au cadrage — Battle.net, personnages, favoris, récents, préférences, du
2026-05-15 au 2026-05-16. La porte de beta, les quotas par compte, deux des quatre modes
produit et quatre des huit flux de capture sont arrivés après, sans jamais revenir dans la
liste. **Neuf des seize routes d'API couvrent des fonctionnalités que les onze tâches ne
nomment pas.**

Elle devient donc un inventaire. Les onze tâches y survivent en table de correspondance,
parce que le reste du dépôt cite ces numéros — « tâche 8 », « 10b », « 8c » — et qu'un
renvoi qui ne résout plus est pire qu'une liste périmée. Ce qui reste à faire tient en deux
entrées, en fin d'inventaire, sous son propre titre.

**Pour le *comment*, lire [`docs/`](docs/README.md), pas cette section.** L'inventaire dit
ce qui existe et depuis quand ; l'architecture, les écrans, la sélection des références et
le corpus y sont décrits en détail, et c'est le code qui y fait autorité. Les sous-sections
datées qui suivent l'inventaire sont conservées intégralement : elles ne décrivent pas le
produit, elles portent le **pourquoi** — pourquoi le ML est sorti, ce que sa sortie coûte,
ce que les CGU interdisent — et ça ne se relit nulle part ailleurs.

### Les onze tâches du 2026-08-03, et ce qu'elles sont devenues

**Préalable — déduplication du pipeline (D1). Fait le 2026-08-03.** Les onze touchaient
toutes le même bloc de code, présent deux fois ; `combatant.ts`, `fight-data.ts` et
`references.ts` portent depuis le traitement commun.

| N° | Tâche | État |
|---|---|---|
| 1 | Capture des étiquettes | **Fait le 2026-08-06.** Schéma versionné, identité `by` hachée au `LABEL_SALT` — refus d'écrire sans sel plutôt qu'écriture en clair —, append-only sous quota horaire. C'est le flux `verdict` du tableau des captures |
| 2 | Rendre le repli de comparabilité visible (C2) | **Fait le 2026-08-06.** `ComparabilityBanner`, niveau atteint et écarts signés, sur les deux chemins |
| 3 | Corriger l'appariement des références (D3) | **Fait le 2026-08-06.** Apparié par nom ; un candidat non identifiable est écarté, pas remplacé |
| 4 | Set bonus et externals dans la sélection | **Fait le 2026-08-06.** Pipeline inversé : `resolveReferences` vérifie `VERIFICATION_WINDOW = 12` candidats avant de payer dégâts et rotation. Clôt C6 au passage |
| 5 | Paralléliser et élargir le vivier (C3) | **Fait le 2026-08-06**, dix pages en parallèle |
| 6 | Agréger les références au lieu de les juxtaposer (D4) | **Fait le 2026-08-06.** `BossResult.sample` + `stat-distribution.ts`. L'échantillon est gratuit : le `CombatantInfo` est déjà payé à la vérification |
| 7 | Opening chain (C5) | **Fait le 2026-08-06.** `parseOpening` + `opening-diff.ts` ; écran et prompt n'énoncent que la **première** divergence |
| 8 | ML | **8a et 8b faits** (lecture du corpus, fente d'exploration — c'est de la capture). **8c–8e abandonnés le 2026-08-13**, voir ci-dessous |
| 9 | Suivi dans le temps | **Fait le 2026-08-07.** `trajectory.ts` + `trend.ts` ; l'axe tracé est le **percentile verrouillé**, pas le DPS |
| 10 | Capture manquante (10a–10d) | **Close le 2026-08-07.** `v: 3` : DPS du sujet, instantané de comparabilité, expositions, retour sur le rapport |
| 11 | Vue roster | **Non commencée**, conditionnée à l'infra v2 — voir « Ce qui n'est pas fait » |

Deux choses à ne pas croire acquises pour autant, écrites avec la tâche 1 et toujours
vraies des huit flux. **Rien n'exploite les étiquettes** : elles s'accumulent, aucune route
ne les relit, aucun modèle ne s'en sert, l'affichage n'en tient pas compte. C'était
l'objectif — capturer d'abord, le calcul se rattrape, la donnée non capturée est perdue.
Et **le stockage reste un Redis append-only**, assumé insuffisant pour de l'entraînement.

### Les quatre modes

`HomeClient` porte un seul état de navigation, `mode`, à quatre valeurs plus `null` ; à
`null` il rend `ModeSelector`. Il n'y a pas d'autre page : `src/app/page.tsx` monte
`HomeClient` sous une frontière de suspense, et l'URL est la source de vérité de l'écran.

| Mode | Ce qu'on lui donne | Ce qu'il rend | Depuis |
|---|---|---|---|
| `character` | nom, royaume, région, difficulté | Le meilleur parse par boss, ses références, ses onglets | v1 |
| `report` | code de rapport, acteur, difficulté | Les boss tués du rapport, la pull étant rechoisissable | v1 |
| `raid` | code de rapport, combat | Les joueurs de la pull ordonnés par marge de progression | 2026-08-08 |
| `pull` | deux pulls du même joueur | L'écart décomposé en matériel, kill time et reste | 2026-08-09 |

Les deux derniers ne coûtent pas un pipeline complet, et c'est ce qui les a rendus
possibles avant la v2 : `raid-ranking.ts` tient en une requête parce qu'un percentile est
déjà une mesure de marge, et `pull-pipeline.ts` compare deux pulls du même joueur, donc
sans vivier de références à résoudre. Aucun des deux ne préfigure la vue roster, qui reste
un problème de latence et de pré-calcul.

### La porte et le compte

Rien de ceci n'apparaissait dans les onze tâches ; l'essentiel est **antérieur** au
cadrage, ce qui explique l'oubli sans l'excuser.

- **Battle.net via NextAuth** (`src/lib/auth.ts`, 2026-05-15). Un visiteur non connecté
  voit `MarketingLanding`, jamais un formulaire.
- **La beta est fermée par défaut** (2026-08-09). `BETA_ALLOWLIST` est lue dans
  l'environnement ; liste absente ou vide vaut *fermée à tous*, et un compte hors liste
  voit `BetaClosedScreen`. Une panne de Redis n'ouvre pas la porte — c'est le correctif du
  2026-08-08 qui a déplacé la liste hors de Redis.
- **`startup-check.ts`** échoue au démarrage plutôt qu'au premier clic d'un raider :
  variable manquante, ou stub de session de développement resté actif en production.
- **Le compte persiste en Redis** : personnages, spec active, favoris, récents,
  préférences d'affichage.

### Les seize routes

| Route | Verbe | Rôle |
|---|---|---|
| `/api/analyze/[encounterId]` | POST | Un boss du chemin personnage |
| `/api/report/analyze` | POST | Les boss tués d'un rapport, à la difficulté demandée |
| `/api/report/[code]` | GET | Métadonnées d'un rapport : combats, acteurs, paliers |
| `/api/raid/[code]` | GET | Le classement d'une pull par marge de progression |
| `/api/pull-comparison` | POST | Deux pulls du même joueur, écart décomposé |
| `/api/ai-report` | GET | Quels fournisseurs ont une clé côté serveur |
| `/api/ai-report` | POST | Le rapport en flux, et l'empreinte du conseil au corpus |
| `/api/labels/comparability` | POST | Le verdict humain « pas comparable », avec sa raison |
| `/api/labels/report` | POST | Le retour du lecteur sur le rapport IA |
| `/api/zones` | GET | Zones et rencontres du formulaire |
| `/api/search/realm` | GET | Autocomplétion de royaume |
| `/api/user/characters` | GET | Les personnages du compte Battle.net |
| `/api/user/characters/active-spec` | GET | La spec active d'un personnage |
| `/api/user/favourites` | POST | Épingler un personnage |
| `/api/user/recents` | POST | Mémoriser une consultation |
| `/api/user/preferences` | GET | Les préférences restituées à l'ouverture |
| `/api/auth/[...nextauth]` | — | Le gestionnaire NextAuth |

**Le partage n'est pas une route.** `ShareButton` copie l'URL courante marquée `shared=1` ;
la marque n'est pas une frontière de sécurité — la forger n'ouvre rien —, elle dit
seulement au serveur que cette ouverture-ci accepte l'instantané du rendu
(`result-snapshot.ts`, 24 h) plutôt qu'un calcul neuf. Le destinataire doit être connecté
comme n'importe quel autre appelant : c'est §2a des CGU qui l'impose, pas une commodité.
Et le `renderId` est refrappé à chaque lecture d'instantané, sans quoi tous les lecteurs
d'un lien s'effondreraient sur une exposition unique dans le corpus.

**`wcl-guard` n'en est pas une non plus** : c'est le module que toute route dépensière
traverse.

### Ce qu'un compte a le droit de dépenser

`src/lib/api/wcl-guard.ts`, 2026-08-08. Le principe : refuser ici ce que Warcraft Logs
refuserait là-bas, plutôt que de le payer.

| Constante | Valeur | Ce qu'elle borne |
|---|---|---|
| `WCL_UNIT_LIMIT` | 2 000 / heure / compte | Le budget WCL d'un compte |
| `BOSS_ANALYSIS_UNITS` | 90 | Une analyse de boss |
| `PULL_COMPARISON_UNITS` | 10 | Une comparaison de pulls |
| `RAID_RANKING_UNITS` | 3 | Un classement de pull |
| `METADATA_UNITS` | 1 | Une lecture de métadonnées |
| `MAX_ENCOUNTERS_PER_REQUEST` | 20 | Ce qu'une seule requête peut demander |

Trois autres quotas horaires, par identité hachée, bornent l'écriture au corpus et l'appel
au modèle : `LABEL_LIMIT = 60`, `EXPOSURE_LIMIT = 120`, `AI_LIMIT = 20`. `consumeQuota`
échoue **ouvert** et `consumeStrictQuota` **fermé** — la première garde la capture, qui ne
se rattrape pas ; la seconde garde la dépense, qui se refait.

### Les huit flux de capture

Sept portent un `kind` versionné ; la demande WCL n'en porte pas, c'est une mesure
d'exploitation entrée au corpus par commodité de stockage.

| Flux | Clé mensuelle | Écrit quand | Depuis |
|---|---|---|---|
| `verdict` | `labels:comparability:AAAA-MM` | Le lecteur conteste une référence affichée | 2026-08-06 |
| `exposure` | `labels:exposure:AAAA-MM` | Une analyse est rendue — la classe positive implicite | 2026-08-07 |
| `advice` / `feedback` | `labels:report:AAAA-MM` | Le rapport IA part / le lecteur le juge | 2026-08-07 |
| `intra-raid` | `labels:intra-raid:AAAA-MM` | Deux joueurs de même spec dans la même pull — la classe positive de haute confiance | 2026-08-08 |
| `pool` | `labels:pool:AAAA-MM` | Une analyse est rendue — le vivier **écarté** comme retenu | 2026-08-09 |
| `pull-comparison` | `labels:pull-comparison:AAAA-MM` | Une comparaison de pulls est rendue | 2026-08-09 |
| `demand` | `labels:demand:AAAA-MM` | Chaque requête qui dépense chez WCL, refus compris | 2026-08-14 |

`renderId` est la seule clé de jointure entre exposition, verdicts et conseils : sans elle,
le corpus a des lignes mais pas de rendus. Aucun flux n'est jamais purgé — le corpus est
l'actif —, tous sont bornés par mois : `CORPUS_MONTH_CAP = 50 000`,
`POOL_MONTH_CAP = 150 000`, `DEMAND_MONTH_CAP = 150 000`. Dépasser ferme le mois en cours,
pas le corpus. Toutes les écritures sont **attendues** avant la réponse : sur un runtime
serverless, une promesse laissée en `void` part avec la fonction.

### Ce qui n'est pas fait

Deux entrées, et rien d'autre n'est en attente.

**Vue roster — ouverte le 2026-08-08, non commencée, conditionnée à l'infra v2.** C'est le
seul axe payable identifié par la section 4. Contenu : priorisation à l'échelle du roster —
qui a le plus de marge, sur quel axe —, qui progresse et qui stagne, comparaison
inter-joueurs de même spec. **Le blocage est la latence, pas le calcul.** Une analyse par
personnage et par boss coûte plusieurs secondes de requêtes WCL ; 25 joueurs × les boss
d'un tier ne tient pas dans une requête synchrone. Ce n'est donc pas « N fois le pipeline
individuel dans une boucle », ça suppose la base pré-calculée de la v2 (section 6).
Corollaire à ne pas perdre : **la monétisation ne dépend pas de plus de finition sur la v1,
elle dépend du pré-calcul.** L'ordre de l'ancienne liste laissait croire l'inverse, et c'est
la principale raison de la réécrire.

**8c à 8e — features, entraînement, remplacement de l'heuristique.** Abandonnés le
2026-08-13, pas ajournés : le gain est réel mais invisible à l'écran, et le coût inclut une
migration de persistance. La démonstration et le seul signal qui rouvrirait le dossier sont
ci-dessous, sous « 8c-8e sortent du plan ».

### Le format « spec » n'est plus alimenté

`docs/superpowers/specs/` porte dix fichiers datés du 2026-08-08, et **aucun n'a de plan** :
les plans s'arrêtent au 2026-08-07 (`2026-08-07-capture-exposition.md`). Le pont
spec → plan → code a été abandonné en route. C'est un constat, pas un reproche — cinq des
dix ont été implémentées directement, plus vite qu'en écrivant le plan.

| Spec du 2026-08-08 | État |
|---|---|
| `00-beta-guilde` | Implémentée le 2026-08-09 |
| `01-mode-raid` | Implémentée le 2026-08-08 |
| `02-capture-vivier` | Implémentée le 2026-08-09 |
| `03-verdict-en-tete` | Implémentée le 2026-08-09 |
| `04-comparer-ses-pulls` | Implémentée le 2026-08-09 |
| `05-contrainte-2-design` | Note de décision, pas une spec d'implémentation |
| `06-classifieur-comparabilite` | **Caduque le 2026-08-13** — voir « 8c-8e sortent du plan » |
| `07-addon-in-game` | Sur le papier, non engagée |
| `08-precalcul-roster` | Sur le papier, non engagée — c'est la vue roster ci-dessus |
| `09-approbation-wcl` | Externe, non engagée — repoussée en fin de projet |

Il vaut mieux l'écrire que laisser dix fichiers suggérer une file d'attente. Ce qui a
remplacé la spec : ce cadrage pour le produit, `docs/` pour le code, et le message de
commit pour le reste. Relancer 07 ou 08 produirait un nouveau document, pas la reprise de
celui-ci.

### Le ML sort de la v1 — décision du 2026-08-07

Trois constats la motivent : le volume d'étiquettes nécessaire reste inconnu (la capture
a démarré la veille), le corpus est un Redis append-only assumé insuffisant pour de
l'entraînement, et la classe positive n'est pas capturée du tout — voir la capture
manquante ci-dessous. Entraîner sur ce qui existe aujourd'hui produirait un classifieur
qui n'a vu que des refus.

**Ce que cette décision coûte, et il faut l'écrire :** la section « CGU RPGLogs » énonce
déjà que retirer la tâche 8 fait tomber le produit sur la **contrainte non négociable
n° 2**, puisque `ia-ml-architecture.md` classe le rapport LLM comme gadget et fait du ML
ce qui rend l'IA structurante. Le suivi dans le temps ne répare pas ça : c'est du calcul
déterministe sur des parses publics, réplicable, pas de l'IA. **La v1 ne satisfait donc
plus la contrainte n° 2**, et c'est un renoncement daté, pas un oubli.

> **Révision du 2026-08-08.** Le verdict ci-dessus mesurait la contrainte n° 2 sous son
> ancienne forme — nécessité fonctionnelle. La contrainte a été reformulée en test de
> substitution (§1, et `ia-ml-architecture.md` §6.1/§6.7) : la question n'est plus si le
> produit tient sans IA, mais si le rapport LLM fait mieux que le guide statique le moins
> cher. Cette question reste ouverte — voir « Ce qui rend l'IA structurante en v1 » dans
> les décisions ouvertes de `ia-ml-architecture.md` — et n'a pas encore été retranchée.

Ce qui rend le renoncement réversible — et donc acceptable — est la capture, et elle
seule. Le corollaire opérationnel joue exactement son rôle ici : le calcul repoussé se
rattrape, la donnée non capturée est perdue. **Conséquence directe : la tâche 10 passe
devant la tâche 9.** Repousser le ML sans compléter la capture ne serait pas un
séquencement, ce serait un abandon qui ne dit pas son nom.

### Tâche 8 : 10b ne suffisait pas — constat du 2026-08-07

10b a bouché le trou **structurel** — le corpus contient enfin des positifs. Il laissait
intact un trou **d'information**, et il faut le nommer parce qu'il ne se voit pas dans le
compte de lignes : les expositions n'enregistrent que les `VERIFICATION_WINDOW = 12`
candidats que l'heuristique de distance avait déjà retenus. **La classe positive est donc
produite par le sélecteur même qu'un modèle devrait remplacer.** Aucune observation
n'existe sur ce que la règle écarte ; un modèle entraîné là-dessus ne peut, au mieux, que
réapprendre la règle, et son score de validation le dirait excellent.

Le correctif est l'**exploration**, et c'est une modification de capture — donc urgente au
titre du corollaire opérationnel, au même titre que 10b. `EXPLORATION_RATE = 0.1` : un
rendu sur dix cède le dernier rang de son panel à un candidat tiré hors fenêtre, marqué
`explored: true` de `ReferenceProvenance` jusqu'à `ExposedReference`, donc jamais confondu
à l'entraînement avec un choix de la règle. Écrit dans `references.ts` seul, conformément
au corollaire de la carte du code.

Trois arbitrages, tous du côté de l'honnêteté de la mesure :

- Le panel garde sa taille : la fente **prend** un rang, elle ne l'ajoute pas. Élargir le
  panel cacherait le coût au lieu de le payer.
- Une exploration disqualifiée n'est pas assise. La fente sert à montrer un candidat que
  la *distance* écarte, pas à contourner les critères éliminatoires.
- La bannière de comparabilité voit la référence explorée comme les autres, mais
  `comparabilityLevel` étant une **médiane** de trois distances, elle en absorbe une
  extrême : la bannière sous-estime donc légèrement le coût de la fente. Forcer `poor`,
  comme pour un substitut, le surestimerait bien davantage — un candidat lointain reste une
  comparaison légitime, un substitut est une comparaison refusée.

**Ce qui reste bloqué sur le volume, explicitement** — aucune de ces trois-là n'est un
travail de capture, aucune ne se perd à attendre :

| | Tâche | Condition d'entrée |
|---|---|---|
| 8c | Features et jeu d'entraînement à partir de l'export | Assez de lignes `negative` **et** `weak-positive` pour qu'un découpage train/test ait un sens, et assez de lignes `explored` pour que la classe positive ne soit pas circulaire |
| 8d | Entraînement et évaluation contre l'heuristique | 8c fait, **et** une base hors du Redis append-only (voir « Migration du corpus ») |
| 8e | Remplacement de l'heuristique de sélection en production | 8d gagne contre la distance sur un test hors échantillon, pas sur le train |

Le seuil chiffré reste inconnu et le rester tant que la capture n'a pas tourné : le poser
maintenant serait un chiffre inventé. Ce qui est acquis, c'est que le compteur ne peut
plus mentir — `scripts/export-corpus.ts` sort les trois états sans jamais en deviner un,
et compte à part les verdicts `v: 1`/`v: 2` qui n'ont pas de `renderId` et ne se joignent
à rien.

### 8c-8e sortent du plan — décision du 2026-08-13

**Le ML n'est plus un chantier prévu.** 8c, 8d et 8e ne sont pas repoussés à une date, ils
quittent l'ordre des travaux. La capture — 8a, 8b, `EXPLORATION_RATE` — reste intégralement
en place et continue de tourner.

**Ce que 8e remplacerait, à l'échelle réelle.** La sélection est aujourd'hui une distance à
deux termes ([comparability.ts:43-48](src/lib/wcl/comparability.ts#L43-L48)) : écart d'ilvl
sur `ILVL_TOLERANCE`, écart de kill time sur `KILL_TIME_TOLERANCE`, combinés en euclidien.
Un modèle produirait la même chose — un score par candidat, un tri, `TOP_N` retenus. Les
deux sont data-driven ; **la seule différence est que les constantes `4` et `0.2` viennent
d'un postulat au lieu d'une mesure.** Il n'y a pas d'un côté des règles rigides et de
l'autre un jugement.

Les trois gains réels, et ils sont réels :

1. Le taux de change entre ilvl et kill time n'a jamais été vérifié.
2. Aucune interaction n'est exprimable — l'ilvl coûte pareil pour toutes les specs, ce qui
   est faux.
3. Set bonus et externals sont binaires et appliqués après coup ; un modèle les pondérerait
   en continu.

**Pourquoi ça ne suffit pas.** Le test de substitution du §6.1 de
[ia-ml-architecture.md](ia-ml-architecture.md) échoue franchement : remplacé par la distance
existante, l'utilisateur ne remarque rien, parce qu'il **ne voit pas la sélection**. Il voit
trois noms, trois ilvl, une médiane. Le vivier de mille candidats et leurs scores ne sont
jamais rendus. La sortie est le même écran avant et après.

En face, le coût est lourd et mal proportionné : 8d exige une base hors du Redis
append-only, donc une migration de persistance — la seule qui existe est
[redis.ts](src/lib/redis.ts) — plus le feature engineering et un protocole d'évaluation
honnête. On paierait une infrastructure pour corriger une imprécision **dont rien ne prouve
qu'elle gêne quelqu'un**.

Trois passages du §6, écrits contre la thèse pro-ML du même document, convergent : §6.2 —
la défendabilité par modèle propriétaire suppose un attaquant qui n'existe pas à cette
échelle ; §6.4 — le moteur déterministe et auditable est un avantage sur un public qui
vérifie les chiffres, pas un pis-aller ; §6.5 — WoWAnalyzer, sans une ligne de ML, est
l'outil d'analyse individuelle le plus utilisé du domaine.

**Ce qui rouvrirait le dossier**, et rien d'autre : que les utilisateurs **contestent les
références qu'on leur montre**. C'est le seul signal qui prouverait que l'imprécision de la
distance est un problème vécu et pas une élégance manquante. Le §6.6 fixe par ailleurs le
volume utile — ~1 000 étiquettes exploitables, ~10 000 confortables, soit une centaine
d'utilisateurs actifs. Les deux conditions se mesurent en beta, pas en conception.

**Ce qui ne change pas.** Le corollaire opérationnel continue de s'appliquer sans réserve :
on abandonne le calcul, jamais la capture. Les étiquettes non prises sont perdues, un
modèle non entraîné ne l'est pas.

### Le suivi dans le temps remplace le rapport isolé — décision du 2026-08-07

L'axe de fidélisation n'est plus la qualité d'un rapport ponctuel mais la **trajectoire**.
C'est le retour de ce que la section 2 avait déjà relevé et que le produit n'avait pas
suivi : *« accélérer une boucle d'apprentissage, pas produire un rapport ponctuel »*, et
*« WCL donne un état, jamais une trajectoire »*.

Le rapport isolé était un mauvais axe de rétention pour une raison structurelle : il est
consommé une fois. Sa qualité fait revenir au prochain kill, jamais demain. Une
trajectoire, elle, a une valeur qui croît avec l'ancienneté du compte — ce qui est aussi
la forme d'actif que la section 6 attend de la base pré-calculée.

**Ce qui est reconstituable et ce qui ne l'est pas** — la distinction commande le travail :

| Donnée | Reconstituable plus tard ? |
|---|---|
| Les parses passés du joueur | **Oui** — WCL garde l'historique, une trajectoire de DPS se rebâtit à froid |
| Le vivier de références au moment T | **Non** — les world rankings d'un tier changent en continu ; qui étaient tes comparables en semaine 2 est irrécupérable en semaine 20 |
| Le verdict de comparabilité rendu au moment T | **Non** — il dépend du vivier ci-dessus |

Donc le suivi lui-même n'est pas urgent : il se calcule après coup. **Ce qui est urgent
est l'instantané de comparabilité**, qui périme avec la saison. C'est un quatrième trou de
capture, non nommé dans le cadrage initial, et de la même nature irréversible que les
trois autres — traité comme candidat en fin de section 10.

**Livré le 2026-08-07, une fois la capture close.** Trois arbitrages tiennent la feature :

- **La courbe trace le percentile verrouillé, pas le DPS.** Le DPS monte tout seul sur un
  palier ; une courbe de DPS présentée comme une courbe de niveau est un graphique
  d'équipement. Le percentile est déjà normalisé contre la population du moment.
- **La décomposition est annoncée comme une estimation.** `analyseTrend` sépare part
  matériel, part kill time et reste ; les deux coefficients sont des hypothèses déclarées,
  pas des mesures — et le verdict ne s'appuie pas dessus. Le **plateau** — « ça ne monte
  plus, et l'équipement le cachait » — est le seul message que le joueur ne voit pas sans
  outil.
- **Deux silences délibérés.** Rien sous deux kills : un rapport isolé reste valide, et le
  modèle est prié de se taire plutôt que d'annoncer une absence. Et il est dit que Warcraft
  Logs ne classe pas un wipe, sans quoi la courbe mentirait par omission — d'où
  l'interdiction faite au modèle de conclure sur la régularité.

`PROMPT_VERSION` passe à **2** : ajouter une instruction change ce que le modèle produit,
et sans ce cran le corpus de 10c mélangerait sous un même label des jugements portés sur
deux rapports différents. `trajectory` entre du même coup dans `PROMPT_AXES` — le lecteur
peut donc signaler cette section comme inutile, comme les six autres.

### Cadrage de la capture manquante

Le corpus actuel (`v: 2`, `src/lib/labels/schema.ts`) capture **un verdict humain négatif
sur une référence**. Trois trous, par ordre de coût si on ne les comble pas.

#### 10a — `subject.dps` : le corpus ne porte pas l'écart

`reference.dps` est enregistré, le DPS du sujet ne l'est pas. À l'entraînement, aucune
étiquette ne permet donc de savoir si le lecteur a contesté une référence 5 % au-dessus de
lui ou 60 % au-dessus — alors que l'écart de DPS *est* la variable que tout le produit
cherche à expliquer. C'est le trou le moins cher et le plus absurde : la valeur est déjà
dans `BossResult.character.dps`, à portée de `ReferenceLabels`.

**Mais il ne suffit pas de recopier le champ.** Les deux chemins ne mesurent pas la même
chose sous ce nom :

| Chemin | Origine de `character.dps` | Comparable à `reference.dps` ? |
|---|---|---|
| Personnage | `ranks[].amount` du meilleur parse (`pipeline.ts:74-75`) | **Oui** — même source que `candidate.amount` |
| Rapport | Calculé par `fetchFightData` sur la table de dégâts (`report-pipeline.ts:91`) | **Non vérifié** — autre source, autre périmètre de cibles possible |

C'est le défaut déjà payé une fois sur le percentile (`23354b4`, « deux mesures sous un
seul nom »). La tâche n'est donc pas « ajouter `subject.dps` » mais **réconcilier les deux
mesures ou enregistrer laquelle a été utilisée** ; passe en `v: 3`.

#### 10b — Les références affichées-non-contestées : il n'y a pas de classe positive

Un classifieur de comparabilité entraîné sur le corpus actuel n'a jamais vu de référence
jugée comparable. C'est le trou le plus grave : il rend la tâche 8 impossible, quel que
soit le volume accumulé. Aggravant, l'absence de clic est **ambiguë** — elle confond « je
la trouve comparable », « je ne l'ai pas regardée » et « je ne me suis pas donné la peine ».

Ce qui manque est un enregistrement d'**exposition** : pour chaque analyse rendue, la
liste des références montrées avec leurs features, et un identifiant que les verdicts
négatifs référencent. Le positif est alors une déduction — *montrée, non contestée* — et
non une mesure. Quatre points de conception à trancher :

- **Écrit côté serveur, à la construction du rapport.** Un POST client peut être bloqué ou
  perdu ; ici c'est toute la classe positive qui partirait avec.
- **Un identifiant de rendu**, porté par `BossResult`, que la soumission de 10a/10c
  reprend. Sans lui, on ne peut ni joindre un refus à son exposition ni dédupliquer.
- **Étiqueté faible, explicitement.** Un champ qui dit que le positif est implicite. Un
  corpus qui mélange un jugement énoncé et une absence de clic sous la même colonne est
  irrécupérable après coup — c'est la leçon de `v: 2` sur les champs non mesurés.
- **Le volume change d'ordre de grandeur.** Aujourd'hui : quelques refus rares. Demain :
  `TOP_N`, voire toute la fenêtre de vérification, à chaque analyse. La liste mensuelle
  Redis n'est pas dimensionnée pour ça, et le §5d des CGU (« build databases ») mord
  nettement plus fort sur une copie systématique de mesures WCL que sur des refus
  ponctuels. **L'atténuation `v: 3` réduite aux pointeurs** — `code`, `fightID`, `actorId`,
  jugements propres, mesures réhydratées à l'entraînement — déjà identifiée puis non
  retenue au titre des CGU, redevient le schéma par défaut pour cette raison-ci.

#### 10c — Un retour sur le rapport lui-même — fait le 2026-08-07

Rien ne mesure aujourd'hui si le rapport sert. Objection immédiate, et il faut y répondre
avant d'écrire la feature : le rapport LLM est classé **gadget**, pourquoi instrumenter un
gadget ? Deux raisons, et aucune n'est « améliorer le prompt » :

1. Le découpage gratuit/payant repose sur l'hypothèse que le gratuit — le rapport ponctuel
   — est ce que WCL donne déjà. Cette hypothèse n'est **pas mesurée**. Un retour est ce qui
   la teste.
2. Couplé au suivi dans le temps, un jugement sur le rapport devient l'amorce d'une
   étiquette d'un autre ordre : *le conseil a-t-il été suivi d'un progrès au kill suivant*.
   Ça, ce n'est pas du réglage de prose, c'est une cible d'apprentissage — et elle n'existe
   que si les deux bouts sont capturés maintenant.

Forme minimale : un verdict, plus **quel axe** a été inutile (DPS, dégâts, ouverture, CD,
talents), rattaché à l'identifiant de rendu de 10b. **Pas de champ de texte libre** :
`MAX_FIELD_LENGTH` le borne mal, il ouvre une entrée de données personnelles dans un
corpus append-only qu'on ne peut pas nettoyer, et le §5c des CGU s'applique dès qu'un
tiers y est nommé.

**Livré en deux enregistrements, pas un** (`src/lib/labels/report.ts`), parce qu'ils ne
naissent ni au même moment ni du même côté :

- L'**empreinte du conseil** (`AdviceRecord`), écrite côté serveur avant que le flux
  parte, et **attendue** — une promesse laissée en `void` meurt avec la fonction
  serverless. Elle porte les axes réellement couverts, le `promptVersion`, le fournisseur
  et le modèle ; jamais la prose. Sans elle, un « inutile » ne se rattache à rien.
- Le **retour du lecteur** (`ReportFeedbackRecord`), qui arrive du navigateur, plus tard,
  et peut ne jamais arriver.

`renderId` les joint à l'exposition de 10b. Le verdict est binaire — une échelle à cinq
crans n'est pas lisible — et `uselessAxes` reste autorisé sur un `useful` : « utile, mais
les talents n'ont rien apporté » est le jugement le plus fréquent et le plus précis.
`axisBodies()` est devenue la source unique du prompt **et** de l'empreinte, pour qu'aucune
seconde fonction ne re-dérive les sections émises.

#### 10d — Candidat : l'instantané de comparabilité — retenu, fait le 2026-08-07

Non demandé, issu de la décision sur le suivi (voir le tableau ci-dessus). Le vivier et le
verdict de comparabilité d'un jour donné ne se reconstituent pas une fois la saison
avancée. 10b y répond en grande partie *si* l'enregistrement d'exposition porte le bloc
`comparability` complet et pas seulement les références retenues — c'est-à-dire
`candidatesConsidered`, `pagesFetched`, `disqualified`, `substituted`, `level`.
**Recommandation : le prévoir dans le schéma de 10b**, plutôt que d'en faire une tâche.
Le coût est de quelques champs ; l'omettre est irréversible.

Recommandation suivie : `ExposureRecord.comparability` (`src/lib/labels/exposure.ts`) porte
le bloc entier, et non les seules références retenues.

### Points ouverts à trancher

- ~~**CGU de l'API WCL**~~ — **vérifié le 2026-08-07, et arbitré.** Voir « CGU RPGLogs »
  ci-dessous. La réponse est défavorable ; la décision est de continuer et de demander
  l'approbation en fin de projet.
- **Volume d'étiquettes** nécessaire pour qu'un classifieur batte une heuristique
  simple. Toujours inconnu. 10b puis 8b ont rendu la question *posable* — il y a une
  classe positive, et elle n'est plus entièrement produite par le sélecteur — mais pas
  répondable : il faut laisser la capture tourner et relire l'export. C'est la condition
  d'entrée de 8c.
- **Migration du corpus** hors du Redis append-only. 10b change l'ordre de grandeur du
  volume ; c'est probablement lui qui déclenche la migration, pas le ML.
- **Chiffre exact du consentement à payer** dans la guilde (combien sur 25).
- ~~**Spec-agnosticisme du prompt IA**~~ — **répondu le 2026-08-08.** `src/lib/ai/` est
  audité : aucun sort, aucune classe et aucune spec n'y sont codés en dur, seuls les tests
  en nomment comme fixtures. Le prompt lit la spec depuis `getSpecInfo` et déclare
  explicitement le cas inconnu au lieu de la faire deviner au modèle. Reste une question de
  qualité, pas de couverture : la consigne sur les paires de substitution est écrite pour
  le cas général et son exactitude par spec n'est pas mesurée.

### CGU RPGLogs — vérifié le 2026-08-07

`warcraftlogs.com/help/terms` renvoie 403 aux fetchers. Le texte a été lu sur
[archon.gg](https://www.archon.gg/wow/articles/help/rpg-logs-api-terms-of-service), même
éditeur (RPGLogs opère Warcraft Logs, FFLogs et Archon) et même CMS d'articles. Trois
clauses décident :

| Clause | Texte | Portée |
|---|---|---|
| §2a | « earning money from it, including, but not limited to advertising, subscriptions, **or** you intend to learn from the data and repackage for sale » | Approbation écrite requise pour tout usage commercial |
| §5d | « Scrape, build databases, or otherwise create permanent copies of such content, or keep cached copies longer than permitted by the cache header » | Vise le corpus d'étiquettes, sans TTL sur `labels:comparability:*` |
| §5c | « you may not expose that content to other users or to third parties without explicit opt-in consent from that user » | `reference.name` et ses mesures |

**Le ML n'est pas la source du problème.** Le §2a se déclenche sur le revenu, pas sur
l'apprentissage : l'abonnement seul suffit à qualifier l'usage de commercial. Retirer la
tâche 8 ne lèverait donc pas l'obligation d'approbation — et ferait tomber le produit sur
la contrainte non négociable n°2, puisque `ia-ml-architecture.md` classe le rapport LLM
comme **gadget** et fait du ML ce qui rend l'IA structurante. Les deux contraintes
non négociables et les CGU se croisent : aucune version monétisée n'échappe à l'approbation.

*Le 2026-08-07, la tâche 8 a précisément été sortie de la v1 — voir « Le ML sort de la
v1 ». Ce paragraphe n'est pas périmé pour autant : il énonce le prix de cette sortie, et
c'est à ce titre qu'il a été repris dans la décision.*

**Décision du 2026-08-07** — la demande d'approbation est repoussée en fin de projet.
Le développement continue comme si elle était acquise. Ce qui est en jeu si elle est
refusée : le modèle de revenu, pas le code. Atténuation identifiée mais non retenue pour
l'instant — un schéma d'étiquette `v: 3` réduit aux pointeurs (`code`, `fightID`,
`actorId`) et aux jugements propres, les mesures WCL étant réhydratées à l'entraînement
plutôt que copiées.

Le mécanisme d'application n'est pas judiciaire mais discrétionnaire : révocation de clé
API, déclenchée par la visibilité et la concurrence. À noter qu'Archon — distributions de
stats par spec sur une population de parses — est le produit visé ici, et appartient à
RPGLogs.

---

## 9. Positionnement et acquisition — ouvert le 2026-08-08

Cette section manquait entièrement. Le cadrage traite l'attractivité (section 4) et la
défendabilité (section 5), jamais **par où les utilisateurs arrivent**. Dix tâches
ordonnées « par valeur », zéro ligne sur la distribution : un outil que personne ne trouve
n'a pas un problème de valeur, il a un problème d'acquisition.

### Le paysage

| Acteur | Ce qu'il fait | Recouvrement |
|---|---|---|
| **Warcraft Logs** | Classements, brackets d'ilvl, comparaison 1-à-1 | Le socle. Donne un **état**, jamais une trajectoire |
| **Archon** | Distributions de builds et de stats par spec sur une population de parses | **Frontal** — c'est la promesse « où se situe mon build dans la distribution » |
| **WoWAnalyzer** | Analyse de rotation par spec, règles écrites à la main, gratuit, open source | **Frontal sur l'individuel**, et plus actionnable qu'un écart de distribution |
| **Raidbots / Bloodmallet** | Sim, l'optimum théorique | Complémentaire — le théorique, pas le réel |

Deux points à ne pas adoucir.

**Archon appartient à RPGLogs.** La section 8 le note en fin de paragraphe CGU, comme une
remarque sur le risque de révocation de clé. La portée est plus large : le concurrent le
plus proche de la promesse produit **est** le licensor dont dépend l'approbation §2a. On ne
demande pas une autorisation à un tiers neutre, mais à l'éditeur dont on attaque le produit
avec ses données. Cela ne change pas la décision du 2026-08-07 (construire comme si
l'approbation était acquise), cela chiffre son risque.

**WoWAnalyzer est le concurrent d'attention sur l'individuel**, et il n'apparaît nulle part
dans ce document. Il a exactement le défaut que `ia-ml-architecture.md` reproche à
l'approche knowledge-driven — règles écrites à la main × 39 specs, vides en semaine 1 —
mais du point de vue du joueur qui plafonne, « tu as perdu 4 % en downtime » bat un
percentile dans une distribution.

### Le wedge réel : la comparabilité éliminatoire

Ce qui n'existe nulle part ailleurs n'est pas la distribution — Archon la fait — mais
**le filtrage éliminatoire avant comparaison** : set bonus, externals, ilvl, kill time,
et le fait de **dire quand le filtre échoue** (`ComparabilityBanner`, écarts signés,
`substituted` en rouge). Archon agrège tous les joueurs d'une spec ; WCL compare au top
mondial. LogLense compare à des joueurs comparables, et refuse de faire semblant sinon.

Deux différenciateurs secondaires, tous deux dans le code : la **première divergence
d'ouverture** dérivée des références et non d'une règle écrite à la main (tâche 7), et la
**décomposition de la trajectoire** en part matériel / part kill time / reste (tâche 9) —
WCL montre l'historique, il ne l'explique pas.

**L'argument d'acquisition est déjà mesuré et n'est utilisé nulle part.** Section 7 : ilvl
des références 292 → 284, écart de DPS présenté 55 k → 25 k, *« plus de la moitié de ce qui
était présenté au joueur comme son retard venait de l'équipement des références »*. C'est
un avant/après chiffré sur un cas réel — la démonstration du wedge en une image. Il est
enterré dans un document interne.

Conséquence sur l'écran : le seul message qu'un joueur ne peut obtenir ailleurs — *ton
retard n'est pas où tu crois* — est calculé mais réparti sur des onglets qu'il faut
explorer. Il devrait être ce qu'on lit en premier.

### Le risque de la section 4 s'est réalisé

La section 4 énonce : *« si le gratuit individuel est excellent, il devient* le *produit
dans la perception, et la couche payante ressemble à une rançon »*. Les dix tâches livrées
sont toutes du gratuit individuel, et la vue roster n'avait ni tâche ni périmètre. La phase
de validation qualité est devenue le produit entier par accumulation, sans décision.

Corollaire à tenir séparé : **« attirer des utilisateurs » et « attirer des payeurs » n'ont
pas la même réponse**, et le cadrage les traite comme une seule question. Attirer : oui,
sur une niche étroite — le joueur confirmé qui plafonne, sur le couple comparabilité +
trajectoire. Monétiser : rien de ce qui est construit n'est payable, par construction,
puisque c'est le gratuit du découpage de la section 5. La tâche 11 ouvre le manque.

### Ce qui reste sans réponse

- **Un canal d'acquisition**, aucun n'est choisi. Le wedge est démontrable en une image ;
  sans canal, aucune quantité de qualité de moteur ne produit un premier utilisateur.
- **Le chiffre du consentement à payer** (combien sur 25) — déjà listé en points ouverts,
  et c'est la mesure la moins chère du projet.
- **Ce qui rend l'IA structurante en v1**, question ouverte de `ia-ml-architecture.md`
  depuis la sortie du ML. Rien n'est facturable tant qu'elle n'a pas de réponse.

Ce qui n'est **pas** recommandé : davantage de travail de comparabilité. Il est bon, il est
clos, et il est invisible pour quelqu'un qui n'a jamais ouvert l'outil.

---

## 10. Règles de collaboration

- Nommer un défaut de raisonnement immédiatement et précisément. Pas de validation
  de complaisance, pas de contradiction gratuite.
- Signaler explicitement quand une piste manque de modèle de monétisation viable
  plutôt que de la laisser filer.
- Distinguer systématiquement PoC et décision de production.
- Ne pas confondre **repousser le calcul** (acceptable) et **repousser la capture
  de données** (irréversible).
