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

> **Divergence à trancher** — la section 5 de cette note laisse le persona payeur ouvert
> (joueur individuel ou raid leader), alors que la section 4 ci-dessus tranche pour
> l'abonnement saisonnier de guilde. Les deux documents ne peuvent pas rester en
> désaccord sur ce point.

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
| C8 | `legacy/` (12 scripts Python) et `prototypes/` (4 maquettes HTML) — le projet a déjà été réécrit une fois | racine |

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

Le même défaut subsiste ailleurs, sous une autre forme : le percentile affiché ne mesure
pas la même chose selon le chemin d'analyse — 81,1 % par le chemin personnage contre 67 %
par le chemin rapport, pour le même kill, sous le même libellé. Non corrigé, à confirmer
contre la documentation WCL avant toute intervention.

**Sur ±20 %** : sur un kill de 5 min, c'est ±60 s. Le kill time et le DPS sont
mécaniquement corrélés (moins de phases, plus d'uptime CD). Se comparer à un kill
20 % plus rapide, c'est attribuer à son gameplay un écart structurel.

---

## 8. Tâches, par ordre de valeur

**Préalable — déduplication du pipeline (D1). Fait le 2026-08-03.** Les tâches ci-dessous
touchaient toutes le même bloc de code, présent deux fois ; `combatant.ts`, `fight-data.ts`
et `references.ts` portent désormais le traitement commun.

1. ~~**Capture des étiquettes**~~ — **fait le 2026-08-06.** Schéma versionné (`v: 1`),
   identité `by` hachée avec `LABEL_SALT` — l'endpoint refuse d'écrire sans sel plutôt
   que d'écrire en clair —, `POST /api/labels/comparability` en append-only, et le
   contrôle « pas comparable » avec raison dans `ComparisonTab`.

   Deux choses à ne pas croire acquises. **Rien n'exploite ces étiquettes** : elles
   s'accumulent, aucune route ne les relit, aucun modèle ne s'en sert, et l'affichage
   n'en tient pas compte. C'était l'objectif — capturer d'abord, le calcul se rattrape,
   la donnée non capturée est perdue. Et **le stockage reste un Redis append-only** :
   assumé comme insuffisant pour de l'entraînement, à migrer le jour où il y aura assez
   de volume pour valoir une vraie base. Les CGU WCL sur le stockage de données dérivées
   restent à trancher avant cette migration. *(v1)*
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
8. **ML** — seulement après accumulation d'étiquettes. *(v2)*

### Points ouverts à trancher

- **CGU de l'API WCL** sur le stockage et la redistribution de données dérivées.
  Une app qui requête à la demande et une app qui constitue une base dérivée ne sont
  pas nécessairement traitées de la même façon. **À vérifier avant tout
  investissement en v2.**
- **Volume d'étiquettes** nécessaire pour qu'un classifieur batte une heuristique
  simple. Inconnu tant que la capture n'a pas démarré.
- **Chiffre exact du consentement à payer** dans la guilde (combien sur 25).
- **Spec-agnosticisme du prompt IA** — le pipeline est spec-agnostique (D6), `src/lib/ai/`
  n'a pas été audité. Faire bien une spec vaut mieux que faire mal 39 — à assumer
  explicitement ou à corriger, pas à laisser flou.

---

## 9. Règles de collaboration

- Nommer un défaut de raisonnement immédiatement et précisément. Pas de validation
  de complaisance, pas de contradiction gratuite.
- Signaler explicitement quand une piste manque de modèle de monétisation viable
  plutôt que de la laisser filer.
- Distinguer systématiquement PoC et décision de production.
- Ne pas confondre **repousser le calcul** (acceptable) et **repousser la capture
  de données** (irréversible).
