# Capture d'exposition (10b) et instantané de comparabilité (10d) — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enregistrer, **côté serveur et à chaque analyse rendue**, quelles références ont été montrées et dans quel vivier — la classe positive que le corpus actuel n'a jamais vue — et y joindre l'instantané de comparabilité, qui périme avec la saison.

**Architecture :** un second type d'enregistrement, `kind: 'exposure'`, dans sa propre liste Redis mensuelle, écrit par les deux route handlers d'analyse après construction des `BossResult`. Un identifiant de rendu (`renderId`) posé par les pipelines circule jusqu'à l'écran ; les verdicts négatifs le reprennent, ce qui les joint à leur exposition et les rend déduplicables. Les deux schémas passent en **`v: 3` réduit aux pointeurs** : `code`, `fightID`, `actorId`, plus les seules grandeurs que LogLense a lui-même calculées. Aucune mesure WCL n'est recopiée ; elles sont réhydratées à l'entraînement.

**Tech Stack :** Next.js 16 (App Router, `runtime = 'nodejs'`), TypeScript, next-auth v4 (`getServerSession`), Upstash Redis en REST, `node:crypto`, Vitest + Testing Library.

---

## Ce que ce plan tranche

Les quatre points de conception laissés ouverts par 10b, plus 10d. Les décisions sont ici, pas dans les tâches ; une tâche qui s'en écarte est à corriger, pas à négocier.

**1. `v: 3` est une convention de corpus, pas un compteur par type.** Les deux enregistrements — exposition et verdict — portent `v: 3` en même temps, et `3` signifie exactement une chose : *pointeurs et jugements propres, aucune mesure WCL recopiée*. Un lecteur du corpus dans un an ne doit pas avoir à savoir de quel type il lit pour savoir ce que la version veut dire. L'alternative — exposition à `v: 1` dans son coin — a été écartée pour ça.

**2. Le champ qui dit que le positif est implicite est `kind`, pas un booléen.** Un `weak: true` toujours vrai ne porte aucune information. Ce qui empêche un jugement énoncé et une absence de clic de se retrouver sous la même colonne, c'est structurel : **clé Redis séparée** (`labels:exposure:*` contre `labels:comparability:*`) et `kind: 'exposure'` à la racine. Ce qu'un consommateur a le droit d'en déduire est écrit une fois dans le type, pas répété à chaque ligne.

**3. Seules les références du panel sont contestables, et le corpus doit le dire.** `sample` porte toute la fenêtre vérifiée (`VERIFICATION_WINDOW = 12`), `topPlayers` les `TOP_N` seules à porter le bouton « Not comparable » de `ReferenceLabels`. Lire « montrée, non contestée » sur une entrée que le lecteur ne pouvait pas contester fabriquerait des positifs. Chaque référence de l'exposition porte donc `contestable: boolean`, et **le positif faible ne se déduit que là où il est vrai**. C'est le point le plus facile à rater et le plus coûteux à rattraper.

**4. L'écriture est attendue avant la réponse, mais ne peut pas faire échouer l'analyse.** Un `void promise` sur un runtime serverless part avec la fonction ; c'est toute la classe positive qui disparaît, et c'est précisément ce que 10b existe pour empêcher. Le coût est un aller-retour Redis (~50 ms) sur une requête qui en a déjà payé des dizaines côté WCL. Une écriture qui échoue est avalée : l'analyse est rendue quand même. *(`waitUntil` de `@vercel/functions` lèverait le coût ; hors périmètre, pas de dépendance ajoutée ici.)*

**5. 10d entre dans le schéma, pas dans une tâche.** Le bloc `comparability` complet est enregistré : `level`, `candidatesConsidered`, `pagesFetched`, `disqualified`, `substituted`, plus les médianes `referenceIlvl` / `referenceKillTimeMs` et les valeurs du sujet. Les médianes sont des agrégats d'un vivier qui n'existera plus ; les omettre est irréversible, les garder coûte quatre nombres.

**6. Le sujet porte sa provenance de mesure — extrait de 10a, à assumer.** Le serveur sait quelle route a produit le rendu, donc quelle mesure `character.dps` désigne : `'ranking'` (`ranks[].amount`, chemin personnage) ou `'damage-table'` (calcul de `fetchFightData`, chemin rapport). C'est un champ d'énumération, posé par l'appelant, qui clôt la moitié *schéma* de 10a sans anticiper sa moitié *réconciliation*. **Sans lui, `v: 3` naîtrait avec un champ non mesuré dès que 10a atterrira — la faute exacte de `v: 2`.** Si ce point est refusé, il faut alors ne pas livrer le passage des verdicts en `v: 3` avant 10a.

**Ce qui n'est pas fait :** rien ne relit ces enregistrements. Pas de route de lecture, pas d'export, pas de dérivation du positif, pas de modèle. On capture ; le calcul se rattrape.

---

## Global Constraints

- **Les quatre commandes passent avant chaque commit** : `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm format:check`. Filtrer leur sortie (`| grep -E "Tests |FAIL"`).
- **On travaille directement sur `main`.** Pas de branche de fonctionnalité.
- **Aucun nom de personnage dans le corpus d'exposition.** `reference.name` relève du §5c des CGU, et le pointeur `actorId` le remplace intégralement. Un test dédié vérifie l'absence.
- **Aucune mesure WCL recopiée** : ni `dps`, ni `ilvl`, ni `killTimeMs`, ni `tierPieces`, ni `externalUptime` de la référence. Uniquement les identifiants et ce que LogLense a calculé (distance, verdicts de disqualification, niveau, comptes).
- **Le client ne fournit ni `v`, ni `at`, ni `by`, ni `renderId` d'invention** — il reprend celui que le serveur a posé sur le `BossResult`.
- **Échouer fermé sur l'identité** : `LABEL_SALT` manquant alors qu'une session existe ⇒ on n'écrit pas. Jamais de repli sur `by: null`, qui affirmerait un anonymat faux.
- **Écarts signés, jamais absolus**, dans le sens `référence − sujet`.
- **Ordre des imports** : le linter fait autorité.
- Clés Redis, format exact : `labels:exposure:<YYYY-MM>` et `labels:comparability:<YYYY-MM>`.

---

## Structure des fichiers

**Créés**

| Fichier | Responsabilité |
|---|---|
| `src/lib/labels/exposure.ts` | Le type `ExposureRecord`, sa construction depuis un `BossResult`, sa clé mensuelle |
| `src/lib/labels/record-exposure.ts` | L'écriture serveur : identité, quota, `RPUSH`, et l'absorption des échecs |
| `src/lib/labels/__tests__/exposure.test.ts`, `record-exposure.test.ts` | |

**Modifiés** — `src/types/index.ts` (`ReferenceProvenance.actorId`, `ReferenceSample.actorId`, `BossResult.renderId`), `src/lib/wcl/references.ts`, `src/lib/wcl/pipeline.ts`, `src/lib/wcl/report-pipeline.ts`, `src/lib/labels/rate-limit.ts` (quota générique), `src/lib/labels/schema.ts` (verdicts en `v: 3`), `src/app/api/labels/comparability/route.ts`, `src/app/api/analyze/[encounterId]/route.ts`, `src/app/api/report/analyze/route.ts`, `src/components/results/ReferenceLabels.tsx`, et leurs tests.

---

## Task 1 : Le pointeur qui remplace le nom

**Files:** Modify `src/types/index.ts`, `src/lib/wcl/references.ts` — Test: `src/lib/wcl/__tests__/references.test.ts` (existant)

Une référence n'est réhydratable que par `code` + `fightID` + `actorId`. Les deux premiers circulent déjà ; le troisième est jeté alors qu'il est sous la main : `verifyCandidate` détient `combatant.sourceID`. Sans lui, le corpus devrait garder `name` pour retrouver l'acteur — c'est-à-dire garder exactement ce que le §5c interdit d'exposer.

- [x] **Step 1** — Ajouter `actorId: number` à `ReferenceProvenance` et à `ReferenceSample` dans `src/types/index.ts`, avec le commentaire disant à quoi il sert : *le pointeur de réhydratation, qui dispense le corpus de conserver le nom.*
- [x] **Step 2** — Le renseigner dans `references.ts` : `buildTopPlayer` a `verified.combatant.sourceID`, `sampleOf` a `v.combatant.sourceID`. Deux lignes.
- [x] **Step 3** — `pnpm typecheck`, puis `pnpm test`.

**Vérification :** `provenance.actorId` et `sample[].actorId` sont des entiers non nuls sur un panel construit depuis une fixture.

---

## Task 2 : `renderId`, porté par `BossResult`

**Files:** Modify `src/types/index.ts`, `src/lib/wcl/pipeline.ts`, `src/lib/wcl/report-pipeline.ts` — Test: tests existants des deux pipelines

Un rendu, un identifiant. Il est **par boss**, pas par requête : chaque boss a son propre vivier et sa propre exposition, et `runAnalysis` en produit plusieurs. Une ré-analyse du même combat produit un nouvel identifiant — c'est une nouvelle exposition, pas un doublon.

- [x] **Step 1** — `BossResult.renderId: string`, à la racine (pas sous `character` : il identifie le rendu, pas le sujet). Commentaire : *ce que les verdicts reprennent pour se joindre à leur exposition ; sans lui, un refus ne peut être ni rattaché ni dédupliqué.*
- [x] **Step 2** — Dans les deux pipelines, `import { randomUUID } from 'node:crypto'` et `renderId: randomUUID()` dans l'objet retourné.
- [x] **Step 3** — Étendre les tests de pipeline : le champ est présent, non vide, et **différent d'un appel à l'autre**.
- [x] **Step 4** — `pnpm typecheck`, `pnpm test`.

---

## Task 3 : Le schéma d'exposition (`v: 3`) et l'instantané 10d

**Files:** Create `src/lib/labels/exposure.ts`, `src/lib/labels/__tests__/exposure.test.ts`

**Produces:** `ExposureRecord`, `ExposedReference`, `SubjectDpsSource`, `buildExposure(...)`, `exposureMonthKey(iso)`.

Pas de `parse*` ici : rien de ce qui est écrit ne vient du navigateur. Le serveur construit l'enregistrement depuis un `BossResult` qu'il a lui-même produit. C'est la différence de nature avec `schema.ts`, et elle doit rester lisible dans le code.

- [x] **Step 1 : écrire les tests qui échouent** — `exposure.test.ts` couvre :
  - `buildExposure` d'un `BossResult` à panel plein : autant d'entrées que `sample`, `contestable: true` pour les seules présentes dans `topPlayers` (appariées sur `code:fightID`), `distance` reprise de la provenance quand elle existe et `null` sinon.
  - **Aucun nom nulle part** : `JSON.stringify(record)` ne contient aucun des noms de la fixture — sujet comme références. Test explicite, pas implicite.
  - Aucune clé `dps`, `ilvl`, `killTimeMs`, `tierPieces`, `externalUptime` sur une entrée de référence (parcours des clés, pas inspection à l'œil).
  - Le bloc `comparability` est recopié en entier, les cinq champs de 10d compris.
  - `Infinity` de `distance` sérialisé en `null`, jamais laissé à `JSON.stringify`.
  - `exposureMonthKey('2026-08-07T09:14:22.000Z') === 'labels:exposure:2026-08'`.
  - Panel vide (`topPlayers: []`, `sample: []`) : l'enregistrement est produit quand même, avec `references: []` — une analyse sans référence est un fait à capturer, pas un cas à ignorer.

- [x] **Step 2 : le type**

```ts
/** Quelle mesure `character.dps` désigne. Les deux chemins ne mesurent pas la même chose. */
export type SubjectDpsSource = 'ranking' | 'damage-table';

export interface ExposedReference {
  code: string;
  fightID: number;
  actorId: number;
  /** Rang dans le panel, 1-indexé ; `null` pour une entrée de la fenêtre hors panel. */
  rank: number | null;
  /**
   * Vraie pour les seules références que l'écran permettait de contester. Un « montrée,
   * non contestée » lu sur une entrée non contestable est un positif fabriqué.
   */
  contestable: boolean;
  qualified: boolean;
  disqualifiedBy: DisqualificationReason[];
  /** Distance de sélection ; `null` quand elle n'a pas pu être calculée. */
  distance: number | null;
}

export interface ExposureRecord {
  v: 3;
  kind: 'exposure';
  at: string;
  /** SHA-256 salé, ou `null` pour un rendu non authentifié. Jamais l'e-mail. */
  by: string | null;
  renderId: string;
  encounterId: number;
  difficulty: number;
  specId: number;
  subject: { code: string; fightID: number; actorId: number; dpsSource: SubjectDpsSource };
  references: ExposedReference[];
  /** L'instantané 10d : le vivier et le verdict du jour ne se reconstituent pas. */
  comparability: Comparability;
}
```

- [x] **Step 3 : `buildExposure(result, args: { by, at, dpsSource })`** — parcourt `result.sample`, apparie sur `` `${code}:${fightID}` `` avec `result.topPlayers` pour `rank` et `distance`, pose `contestable` sur la même appartenance. Documenter en tête du fichier ce qu'un consommateur a le droit d'en déduire, et rien d'autre : *une référence `contestable` non citée par un verdict portant le même `renderId` est un positif faible ; toute autre lecture est une invention.*
- [x] **Step 4** — `pnpm test`, `pnpm lint`, `pnpm format:check`.

---

## Task 4 : Un quota générique, et l'écriture serveur

**Files:** Modify `src/lib/labels/rate-limit.ts` — Create `src/lib/labels/record-exposure.ts`, `src/lib/labels/__tests__/record-exposure.test.ts` — Test: `rate-limit.test.ts` (existant)

- [x] **Step 1 : généraliser le quota sans changer sa sémantique** — extraire `consumeQuota(prefix: string, limit: number, by: string, atMs: number)` ; `consumeLabelQuota` devient un appel enveloppant avec `'ratelimit:labels'` et `LABEL_LIMIT`. **Les tests existants ne changent pas** — c'est le critère : la clé produite, l'échec ouvert et le `Retry-After` restent identiques. Ajouter `EXPOSURE_LIMIT = 120` et le préfixe `'ratelimit:exposure'`.

  L'échec ouvert est conservé pour la même raison qu'ailleurs : une exposition perdue ne se rattrape pas, et `redisAppend` refusera de toute façon si Redis est en panne.

- [x] **Step 2 : `recordExposure(bosses, { dpsSource })`** dans `record-exposure.ts` — une fonction, appelée par les deux routes :
  1. `getServerSession(authOptions)` ; identité = `email ?? name ?? ''`.
  2. Session présente → `hashUserId` ; s'il jette (sel absent), **on n'écrit rien** et on rend. Pas de repli.
  3. Session absente → `by = null`, pas de quota (rien sur quoi le compter ; le coût WCL d'une analyse borne déjà le débit).
  4. Un `at` unique pour tous les boss du lot.
  5. Pour chaque `BossResult` non nul : `buildExposure`, puis `redisAppend(exposureMonthKey(at), JSON.stringify(record))`.
  6. **Tout est enveloppé dans un `try/catch` qui avale.** Cette fonction ne jette jamais et ne rend rien : elle ne doit pas pouvoir faire échouer une analyse.

- [x] **Step 3 : tests** (Redis et `getServerSession` moqués) — écrit une entrée par boss non nul ; ignore les `null` ; `by` haché quand la session existe ; `by: null` sans session ; **aucune écriture** quand `LABEL_SALT` manque et qu'une session existe ; un `redisAppend` qui rejette ne fait pas jeter `recordExposure` ; quota dépassé ⇒ pas d'écriture.
- [x] **Step 4** — les quatre commandes.

---

## Task 5 : Brancher les deux routes

**Files:** Modify `src/app/api/analyze/[encounterId]/route.ts`, `src/app/api/report/analyze/route.ts` — Test: `src/app/api/analyze/[encounterId]/__tests__/route.test.ts`, et un test créé pour la route rapport

Les deux routes ne diffèrent que par ce qu'elles passent en `dpsSource` — `'ranking'` côté personnage (`ranks[].amount`), `'damage-table'` côté rapport (`fetchFightData`). C'est la même asymétrie que le reste du produit, et elle est enfin consignée.

- [x] **Step 1** — `analyze/[encounterId]` : `await recordExposure(result ? [result] : [], { dpsSource: 'ranking' })` **avant** le `NextResponse.json(result)`, à l'intérieur du `try` existant.
- [x] **Step 2** — `report/analyze` : `await recordExposure(bosses, { dpsSource: 'damage-table' })` avant la réponse.
- [x] **Step 3** — Tests : la réponse d'analyse est **inchangée** ; `recordExposure` est appelé une fois avec le bon `dpsSource` ; une analyse qui rend `null` n'écrit rien ; un `recordExposure` qui rejetterait (il ne devrait pas) ne change pas le code de statut.
- [x] **Step 4** — les quatre commandes.

---

## Task 6 : Les verdicts passent en `v: 3`

**Files:** Modify `src/lib/labels/schema.ts`, `src/app/api/labels/comparability/route.ts`, `src/components/results/ReferenceLabels.tsx` — Test: leurs tests existants

Le verdict cesse d'être autoportant : ce qu'il décrivait — vivier, niveau, mesures des deux côtés — vit désormais dans l'exposition que `renderId` désigne. Ce qui reste est le jugement, son objet, et de quoi rester partiellement exploitable si l'exposition n'a pas pu être écrite.

- [x] **Step 1 : le schéma** — `LabelSubmission` devient :
  - `renderId: string` (**obligatoire**, validé par `str`), `reason`, `encounterId`, `difficulty`, `specId` — ces trois derniers restent malgré la redondance avec l'exposition : un verdict orphelin d'exposition doit rester lisible.
  - `subject: { code, fightID, actorId }` — pointeurs seuls. Disparaissent : `ilvl`, `killTimeMs`, `tierPieces`, `externalUptime`.
  - `reference: { code, fightID, actorId, disqualifiedBy }`. Disparaissent : `name`, `ilvl`, `killTimeMs`, `dps`, `tierPieces`, `externalUptime`. **`name` disparaît en premier** : c'est le §5c.
  - `scores: { distance, ilvlGap, killTimeGapPct, rank }` — **conservés**. Ce sont les jugements de LogLense sur un vivier qui aura disparu ; ils ne se recalculent pas.
  - `pool` **supprimé** : `candidatesConsidered`, `pagesFetched` et `level` sont dans l'exposition, et 10d les y veut de toute façon.
  - `ComparabilityLabel` porte `v: 3` et `kind: 'verdict'` — la contrepartie de `kind: 'exposure'`.
- [x] **Step 2** — Réécrire `parseSubmission` en conséquence ; refuser un corps sans `renderId`. Mettre à jour le commentaire de `v` : *`3` depuis le passage aux pointeurs — les enregistrements `2` portent des mesures WCL recopiées, les `3` les réhydratent.*
- [x] **Step 3** — `route.ts` : `{ v: 3, kind: 'verdict', at, by, ...submission }`. Le reste (401, 413, 429, 503, quota, `monthKey`) est inchangé.
- [x] **Step 4** — `ReferenceLabels.tsx` : le corps envoyé se réduit ; ajouter `renderId: result.renderId` et `actorId: provenance.actorId`. `ilvlGap` a besoin de `provenance.ilvl` et `comparability.myIlvl` **pour le calcul**, qui restent disponibles côté client — seule leur *écriture* disparaît.
- [x] **Step 5** — Mettre à jour `schema.test.ts`, `route.test.ts`, `ReferenceLabels.test.tsx` : corps valide en `v: 3`, refus sans `renderId`, et l'assertion « aucun nom dans le corps envoyé ».
- [x] **Step 6** — les quatre commandes.

---

## Vérification finale

- [x] `pnpm typecheck && pnpm test && pnpm lint && pnpm format:check` (sortie filtrée).
- [x] Une analyse manuelle de bout en bout : l'exposition apparaît dans `labels:exposure:<mois>`, un « Not comparable » écrit un verdict portant le **même `renderId`**, et les deux se joignent.
- [x] `LLEN` des deux clés : c'est la mesure du corpus, et l'ordre de grandeur qui décidera de la migration hors Redis.

Relevé du 2026-08-07, sur l'API réelle et le Redis réel :

| Ce qui a été vérifié | Résultat |
|---|---|
| Jointure | `renderId=5255011c-…f297c8` porté par l'exposition **et** par le verdict, même `by`, même pointeur sujet |
| Positifs faibles dérivés | 2 — les rangs 2 et 3 des 3 entrées `contestable`, montrées et non contestées |
| Les deux routes | `dpsSource: 'ranking'` (chemin personnage) et `'damage-table'` (chemin rapport) |
| Les deux identités | `by` haché sous session, `by: null` sur un rendu anonyme — l'exposition est écrite dans les deux cas |
| Refus | verdict sans `renderId` → 400 ; verdict sans session → 401 |
| CGU §5c | aucun nom de tiers ni mesure WCL recopiée dans les enregistrements `v: 3` ; les `v: 1` en portent encore, d'où le contraste |
| Taille | 2012, 2042, 2047 octets par exposition |

---

## Risques et ce qui reste ouvert

- **Le volume change d'ordre de grandeur.** Une exposition fait **≈ 2030 octets** — mesuré sur trois enregistrements réels le 2026-08-07 (2012, 2042, 2047 o), soit **plus du double de l'estimation initiale de 900 o**, qui sous-comptait les clés JSON répétées sur onze références. Une par boss et par analyse, contre quelques verdicts rares par mois aujourd'hui. La liste mensuelle Redis tiendra le temps de mesurer, pas au-delà, et le seuil arrive deux fois plus tôt que prévu : c'est cette tâche, et non le ML, qui déclenchera la migration du corpus. Relever `LLEN` régulièrement.
- **§5d des CGU.** Une copie systématique mord plus fort que des refus ponctuels ; la réduction aux pointeurs est l'atténuation, pas une exonération. Toujours aucun TTL sur les clés — assumé, et à reposer avec la demande d'approbation en fin de projet.
- **Les médianes de `comparability` sont dérivées de mesures WCL.** Tension reconnue et tranchée dans la décision 5 : ce sont des agrégats d'un vivier qui n'existera plus, pas une copie redistribuable.
- **`by: null` pour les rendus non authentifiés.** Les routes d'analyse ne sont derrière aucun garde (pas de `middleware.ts`). Une exposition anonyme reste jointe à son verdict par `renderId` ; elle n'est simplement pas attribuable, et le corpus le dit au lieu de le deviner.
- **10a n'est pas clos par ce plan** — seule sa moitié schéma l'est (`subject.dpsSource`). La réconciliation des deux mesures, ou le choix de n'en garder qu'une, reste à faire.
