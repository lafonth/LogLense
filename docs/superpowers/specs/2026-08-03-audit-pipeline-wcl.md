# Audit du pipeline WCL — rapport de divergence

**Date** : 2026-08-03
**Objet** : vérification des constats de `PRODUCT_CONTEXT.md` section 7 contre le code réel
**Référence** : branche `main`, commit `6989056`

Les constats C1→C8 provenaient d'un snapshot du repo, pas d'une lecture du working tree.
Ce document établit leur verdict et signale ce que le snapshot avait manqué.

Principe appliqué : **le code fait autorité sur les constats techniques**,
`PRODUCT_CONTEXT.md` fait autorité sur les décisions produit.

---

## Verdicts C1 → C8

| # | Verdict | Constat réel |
|---|---|---|
| C1 | **Confirmé** | `src/lib/wcl/constants.ts:4-5` — `KILL_TIME_TOLERANCE = 0.2`, `TOP_N = 3` |
| C2 | **Confirmé, et plus étendu** | `src/lib/wcl/pipeline.ts:227-230` — lignes exactes. Mais le fallback est **dupliqué** dans `src/lib/wcl/report-pipeline.ts:197-200` |
| C3 | **Confirmé** | `src/lib/wcl/queries.ts:74-88` — `Q_WORLD_RANKINGS` ne passe que `specName`, `className`, `metric`, `difficulty`, `leaderboard`. Aucun ilvl, aucune composition. Ajout : pas d'argument `page`, donc l'univers de candidats est plafonné à la première page renvoyée par WCL |
| C4 | **Partiellement exact** | `src/lib/wcl/parsers.ts:31-34`. `avgIlvl` **est** utilisé : affiché (`src/components/results/StatsTable.tsx:9`, `src/components/results/OverviewTab.tsx:55`) et injecté dans le prompt IA (`src/lib/ai/prompt.ts:81`). Le constat n'est vrai que pour **la sélection des candidats** |
| C5 | **Confirmé** | `src/lib/wcl/queries.ts:110-119` — `casts: table(dataType: Casts…)`. `src/lib/wcl/parsers.ts:48-58` ne produit que `casts` et `perMin`. L'ordre temporel est perdu à la source |
| C6 | **Confirmé, dans les deux pipelines** | `src/lib/wcl/pipeline.ts:233` et `src/lib/wcl/report-pipeline.ts:203`. Précision : la boucle sur les **boss** est déjà parallélisée (`pipeline.ts:315`), seule celle sur les logs de référence est séquentielle |
| C7 | **Confirmé** | `CLAUDE.md` — six lignes, uniquement des `@`-imports de skills |
| C8 | **Confirmé** | `legacy/` : douze scripts Python (PoC WCL). `prototypes/` : quatre maquettes HTML. Les deux sont suivis par git |

---

## Divergences — ce que le snapshot avait manqué

### D1. Le pipeline existe en deux exemplaires

`src/lib/wcl/pipeline.ts` (analyse par personnage) et `src/lib/wcl/report-pipeline.ts`
(analyse par rapport WCL) dupliquent la sélection des références, le fallback, la boucle
séquentielle, le calcul des cibles et l'agrégation des dégâts.

`PRODUCT_CONTEXT.md` raisonne comme s'il existait un seul chemin. Conséquence : **chaque
tâche de la section 8 coûte le double**, ou impose d'extraire d'abord le traitement commun.

### D2. Aucune base de données

La seule persistance est Upstash Redis en REST, réduite à `GET` / `SET`
(`src/lib/redis.ts`). Pas de Postgres, pas d'ORM.

La tâche 1 (« une table, un endpoint, une insertion ») n'a pas de substrat : le choix d'un
stockage la précède. La priorité reste inchangée — la capture est irréversible — mais le
coût annoncé est sous-estimé.

### D3. Appariement incorrect du joueur de référence

`src/lib/wcl/pipeline.ts:48` et `src/lib/wcl/report-pipeline.ts:211-212` : le combattant de
référence est retenu par `e.specID === charEvent.specID`, c'est-à-dire **le premier joueur
de la même spec présent dans ce raid**.

Si deux joueurs de la même spec participent au pull classé, les stats, talents et casts
analysés peuvent être ceux du mauvais joueur, alors que le DPS affiché provient du ranking.
Défaut silencieux, qui corrompt exactement la donnée sur laquelle repose la comparaison.

Correction : apparier par nom d'acteur, comme le fait déjà `getCombatantByName` pour le
joueur analysé.

### D4. Le chemin nominal ne produit pas une distribution

`similar.slice(0, TOP_N)` retient les trois **meilleurs parses** de la fenêtre, pas trois
tirages représentatifs.

Le produit décrit en section 2 de `PRODUCT_CONTEXT.md` (« où se situe mon build dans la
distribution ») n'est donc pas seulement absent : le code fait l'inverse (« voici le
meilleur joueur »). La tâche 5 est un changement de nature, pas un ajustement.

### D5. Les externals sont plus proches qu'annoncé

`Q_ROTATION` récupère déjà `buffs: table(dataType: Buffs…)` pour **chaque candidat**.
Détecter une Power Infusion reçue est un test sur la sortie de `parseUptime`, pas une
requête supplémentaire.

`PRODUCT_CONTEXT.md` classe ce critère comme « requiert lecture des buffs du log » comme
s'il était coûteux. La donnée est déjà dans la réponse, simplement ignorée.

### D6. Le spec-agnosticisme est largement atteint

`src/lib/specs.ts` et `src/data/talents/spec-*.json` couvrent de nombreuses specs, et la
détection se fait depuis le `CombatantInfo` (`src/lib/wcl/pipeline.ts:147`,
`src/lib/wcl/report-pipeline.ts:99-104`).

Le point ouvert « le code est tuné Feral » est obsolète pour le pipeline. La question reste
ouverte pour le prompt IA (`src/lib/ai/`), non audité ici.

---

## Conséquence sur l'ordre des travaux

La déduplication de `pipeline.ts` et `report-pipeline.ts` (D1) précède les tâches 1 à 5 de
la section 8 : toutes touchent le même bloc de code, présent deux fois.

D3 et C2 se corrigent ensuite sur le module commun, une seule fois chacun.
