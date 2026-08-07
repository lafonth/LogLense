# PRODUCT_CONTEXT.md

Base de connaissance produit pour LogLense.
Issue d'une session de cadrage produit (phase d'extraction des frictions).

**Statut de ce document** : les constats sur le code ont été vérifiés contre le working
tree le 2026-08-03 (commit `6989056`). Voir la section 7 et le rapport complet dans
[docs/superpowers/specs/2026-08-03-audit-pipeline-wcl.md](docs/superpowers/specs/2026-08-03-audit-pipeline-wcl.md).

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
2. **Critère anti-gadget** — l'IA doit être le cœur du produit. Test :
   *retire l'IA, si le produit tient encore debout, c'était un gadget.*

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
| C1 | `KILL_TIME_TOLERANCE = 0.2` et `TOP_N = 3` en constantes | `src/lib/wcl/constants.ts:4-5` |
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
| D1 | **Le pipeline existe en deux exemplaires** — `pipeline.ts` et `report-pipeline.ts` dupliquent sélection des références, fallback, boucle séquentielle et agrégation. Chaque tâche de la section 8 coûte le double tant que ce n'est pas traité |
| ~~D2~~ | ~~**Aucune base de données** — la capture d'étiquettes n'a pas de substrat~~ — **clos le 2026-08-06.** Voir ci-dessous : la prémisse était fausse dès l'écriture |
| ~~D3~~ | ~~**Le joueur de référence est apparié par spec, pas par nom**~~ — **clos le 2026-08-06.** `fetchReferencePlayers` apparie par nom ; un candidat non identifiable est écarté, jamais remplacé par un autre joueur. `findCombatantBySpecId` est supprimé |
| ~~D4~~ | ~~**Le chemin nominal ne produit pas une distribution**~~ — **clos le 2026-08-06.** `BossResult.sample` porte toute la fenêtre vérifiée : stats et talents se lisent en min / médiane / max / percentile sur cet effectif. `topPlayers` reste à `TOP_N` pour dégâts et rotation, qui coûtent une requête par référence — et l'écran comme le prompt disent lequel des deux effectifs porte quel tableau |
| ~~D5~~ | ~~**Les externals sont déjà à portée**~~ — **clos le 2026-08-06.** Les buffs sont désormais requêtés pour la fenêtre de vérification et appariés par guid ; une PI reçue au-delà de la tolérance élimine le candidat |
| D6 | **Le spec-agnosticisme est atteint côté pipeline** — la spec est détectée depuis le `CombatantInfo`, `src/data/talents/` couvre de nombreuses specs. Reste ouvert côté prompt IA |

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

## 8. Tâches, par ordre de valeur

**Préalable — déduplication du pipeline (D1). Fait le 2026-08-03.** Les tâches ci-dessous
touchaient toutes le même bloc de code, présent deux fois ; `combatant.ts`, `fight-data.ts`
et `references.ts` portent désormais le traitement commun.

1. ~~**Capture des étiquettes**~~ — **fait le 2026-08-06.** Schéma versionné (`v: 2`
   depuis l'ajout des critères éliminatoires — palier de set et uptime d'externals des
   deux côtés, plus le verdict de sélection ; les enregistrements `v: 1` ne les portent
   pas, et c'est une absence de mesure, pas une valeur nulle), identité `by` hachée avec
   `LABEL_SALT` — l'endpoint refuse d'écrire sans sel plutôt que d'écrire en clair —,
   `POST /api/labels/comparability` en append-only sous quota horaire par identité hachée
   (`LABEL_LIMIT = 60`, réponse `429` avec `Retry-After`), et le contrôle « pas
   comparable » avec raison dans `ComparisonTab`.

   Deux choses à ne pas croire acquises. **Rien n'exploite ces étiquettes** : elles
   s'accumulent, aucune route ne les relit, aucun modèle ne s'en sert, et l'affichage
   n'en tient pas compte. C'était l'objectif — capturer d'abord, le calcul se rattrape,
   la donnée non capturée est perdue. Et **le stockage reste un Redis append-only** :
   assumé comme insuffisant pour de l'entraînement, à migrer le jour où il y aura assez
   de volume pour valoir une vraie base. Les CGU WCL sur le stockage de données dérivées
   sont tranchées — voir « CGU RPGLogs » plus bas. *(v1)*
2. ~~**Rendre C2 visible**~~ — **fait le 2026-08-06.** `ComparabilityBanner` énonce le
   niveau atteint et les écarts signés, sur les deux chemins.
3. ~~**Corriger D3**~~ — **fait le 2026-08-06.** Le joueur de référence est apparié par
   nom, et un candidat non identifiable est écarté plutôt que remplacé.
4. ~~**Set bonus et externals dans la sélection**~~ — **fait le 2026-08-06.** Le pipeline
   est inversé : `resolveReferences` score tout le vivier, **vérifie en parallèle** les
   `VERIFICATION_WINDOW = 12` candidats les plus proches (`CombatantInfo` + buffs), puis
   ne récupère dégâts et rotation que des survivants — ce qui clôt au passage C6. Voir
   ci-dessous.
5. ~~**Paralléliser et élargir la fenêtre de candidats**~~ (C3) — **fait le 2026-08-06**,
   dix pages en parallèle. La boucle séquentielle sur les logs de référence eux-mêmes
   (C6) est tombée avec la tâche 4.
6. ~~**Agréger les références au lieu de les juxtaposer**~~ (D4) — **fait le 2026-08-06.**
   `BossResult.sample` s'ajoute à `topPlayers` et porte toute la fenêtre vérifiée.
   `src/lib/comparison/stat-distribution.ts` en tire min, médiane, max et percentile de
   rang moyen ; `StatsTable`, `TalentDiff` et `src/lib/ai/prompt.ts` le consomment.
   L'échantillon est gratuit — `parseStats` dérive stats et talents du `CombatantInfo`
   déjà payé à la vérification — donc seuls dégâts et rotation restent à `TOP_N`.
   La distribution porte sur les qualifiés, et retombe sur l'échantillon entier quand
   aucun ne l'est, en le disant.
7. ~~**Opening chain**~~ (C5) — **fait le 2026-08-06.** `Q_CAST_EVENTS` interroge
   `events(dataType: Casts)` en plus du tableau agrégé, `parseOpening` en tire la
   séquence, `src/lib/comparison/opening-diff.ts` la confronte à la majorité des
   références, et `OpeningChain` comme la section `### Opening` du prompt n'énoncent
   que la **première** divergence. Voir « Constats clos » ci-dessous.
8. ~~**ML**~~ — **sorti de la v1 le 2026-08-07.** Voir « Le ML sort de la v1 » ci-dessous.
   Reste en v2, sans date, conditionné au volume d'étiquettes. *(v2)*
9. **Suivi dans le temps** — le nouvel axe de fidélisation. Voir ci-dessous. *(v1)*
10. **Capture manquante** — `subject.dps`, les références affichées-non-contestées, et un
    retour sur le rapport. Voir « Cadrage de la capture manquante ». *(v1, avant 9)*

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

Ce qui rend le renoncement réversible — et donc acceptable — est la capture, et elle
seule. Le corollaire opérationnel joue exactement son rôle ici : le calcul repoussé se
rattrape, la donnée non capturée est perdue. **Conséquence directe : la tâche 10 passe
devant la tâche 9.** Repousser le ML sans compléter la capture ne serait pas un
séquencement, ce serait un abandon qui ne dit pas son nom.

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

#### 10c — Un retour sur le rapport lui-même

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

#### 10d — Candidat : l'instantané de comparabilité

Non demandé, issu de la décision sur le suivi (voir le tableau ci-dessus). Le vivier et le
verdict de comparabilité d'un jour donné ne se reconstituent pas une fois la saison
avancée. 10b y répond en grande partie *si* l'enregistrement d'exposition porte le bloc
`comparability` complet et pas seulement les références retenues — c'est-à-dire
`candidatesConsidered`, `pagesFetched`, `disqualified`, `substituted`, `level`.
**Recommandation : le prévoir dans le schéma de 10b**, plutôt que d'en faire une tâche.
Le coût est de quelques champs ; l'omettre est irréversible.

### Points ouverts à trancher

- ~~**CGU de l'API WCL**~~ — **vérifié le 2026-08-07, et arbitré.** Voir « CGU RPGLogs »
  ci-dessous. La réponse est défavorable ; la décision est de continuer et de demander
  l'approbation en fin de projet.
- **Volume d'étiquettes** nécessaire pour qu'un classifieur batte une heuristique
  simple. Toujours inconnu, et la question est mal posée tant que 10b n'est pas fait :
  un corpus sans classe positive n'a pas de volume utile, quel que soit son nombre de
  lignes. À reposer après la capture d'exposition.
- **Migration du corpus** hors du Redis append-only. 10b change l'ordre de grandeur du
  volume ; c'est probablement lui qui déclenche la migration, pas le ML.
- **Chiffre exact du consentement à payer** dans la guilde (combien sur 25).
- **Spec-agnosticisme du prompt IA** — le pipeline est spec-agnostique (D6), `src/lib/ai/`
  n'a pas été audité. Faire bien une spec vaut mieux que faire mal 39 — à assumer
  explicitement ou à corriger, pas à laisser flou.

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

## 9. Règles de collaboration

- Nommer un défaut de raisonnement immédiatement et précisément. Pas de validation
  de complaisance, pas de contradiction gratuite.
- Signaler explicitement quand une piste manque de modèle de monétisation viable
  plutôt que de la laisser filer.
- Distinguer systématiquement PoC et décision de production.
- Ne pas confondre **repousser le calcul** (acceptable) et **repousser la capture
  de données** (irréversible).
