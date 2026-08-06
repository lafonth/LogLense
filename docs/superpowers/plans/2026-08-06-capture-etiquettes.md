# Capture d'étiquettes de comparabilité — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enregistrer dans un corpus durable et append-only chaque décision « cette référence n'est pas comparable », avec son motif et le contexte de classement du moment.

**Architecture:** Un schéma versionné validé côté serveur, écrit par `RPUSH` dans une liste Redis découpée par mois. Le client ne fournit jamais l'identité ni l'horodatage — le serveur les pose. Un prérequis fait circuler jusqu'à l'écran la provenance que le pipeline jetait, sans quoi rien ne peut nommer ce qui est étiqueté.

**Tech Stack:** Next.js 16 (App Router, route handlers `runtime = 'nodejs'`), TypeScript, next-auth v4 (`getServerSession`), Upstash Redis en REST, `node:crypto`, Vitest + Testing Library, Tailwind v4.

## Global Constraints

Copiées de la spec. Elles s'appliquent à toutes les tâches.

- **Les quatre commandes doivent passer avant chaque commit** : `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm format:check`. Le hook pre-commit les exécute. `pnpm lint` émet aujourd'hui exactement **un avertissement préexistant** dans `AIReportTab.tsx` (`react/set-state-in-effect`) et **zéro erreur** — ne pas y toucher.
- **On travaille directement sur `main`.** Ce projet n'utilise pas de branches de fonctionnalité. C'est une instruction permanente du partenaire humain.
- **Aucune exploitation des étiquettes** — pas de filtrage du vivier, pas de seuil ajusté, pas de modèle, aucune route de lecture ni d'export. On capture, on ne calcule pas.
- **Aucune charge WCL brute recopiée** dans le corpus : uniquement des identifiants et les grandeurs que LogLense a lui-même calculées.
- **Écarts signés, jamais absolus**, dans le sens `référence − sujet`.
- **Échouer fermé** : aucune réponse ne prétend qu'une écriture a eu lieu si elle n'a pas eu lieu. Pas de valeur de repli quand `LABEL_SALT` manque.
- **Le client ne fournit ni `v`, ni `at`, ni `by`.** Le serveur les pose. La validation ne fait jamais confiance au corps reçu.
- **Interface** : aucun `style={{}}` dans les composants ; tous les chiffres en `font-mono`, y compris dans une phrase — on enveloppe alors le nombre, pas la phrase ; on ne surcharge jamais la taille d'une primitive via son `className`. `text-danger` est réservé aux erreurs — un échec d'envoi en est une.
- **Ordre des imports** : le linter fait autorité. Ne pas réordonner à la main contre lui.
- Motifs, valeur exacte et immuable : `'externals' | 'set-bonus' | 'kill-time' | 'ilvl' | 'other'`.
- Clé Redis, format exact : `labels:comparability:<YYYY-MM>`.

---

## Structure des fichiers

**Créés**

| Fichier | Responsabilité |
|---|---|
| `src/lib/labels/schema.ts` | Le type `ComparabilityLabel`, la liste des motifs, la validation d'un corps entrant, la clé du mois |
| `src/lib/labels/identity.ts` | Le hachage salé de l'identifiant de session, et l'échec quand le sel manque |
| `src/app/api/labels/comparability/route.ts` | La route d'écriture |
| `src/components/results/ReferenceLabels.tsx` | Le contrôle « pas comparable » |
| `src/lib/labels/__tests__/schema.test.ts`, `identity.test.ts` | |
| `src/app/api/labels/comparability/__tests__/route.test.ts` | |
| `src/components/results/__tests__/ReferenceLabels.test.tsx` | |

**Modifiés** — `src/lib/redis.ts` (`redisAppend`), `src/types/index.ts` (`ReferenceProvenance`, `TopPlayer.provenance`, `BossResult.character.source`, `BossResult.difficulty`), `src/lib/wcl/references.ts` (références scorées + provenance), `src/lib/wcl/pipeline.ts` et `report-pipeline.ts` (provenance du sujet, `difficulty`), `src/components/results/ComparisonTab.tsx`, `.env.example`.

---

## Task 1: Le schéma et sa validation

**Files:**
- Create: `src/lib/labels/schema.ts`
- Test: `src/lib/labels/__tests__/schema.test.ts`

**Interfaces:**
- Consumes: `ComparabilityLevel` depuis `@/lib/wcl/comparability` (valeurs : `'close' | 'approximate' | 'poor' | 'none'`).
- Produces: `LABEL_REASONS`, `LabelReason`, `LabelSubmission`, `ComparabilityLabel`, `parseSubmission(input: unknown): LabelSubmission | null`, `monthKey(isoTimestamp: string): string`.

`LabelSubmission` est ce que le client envoie. `ComparabilityLabel` est ce qui est écrit : la soumission plus `v`, `at`, `by`, que **seul le serveur pose**.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `src/lib/labels/__tests__/schema.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { LABEL_REASONS, monthKey, parseSubmission } from '../schema';

function validBody() {
  return {
    reason: 'externals',
    encounterId: 3177,
    difficulty: 5,
    specId: 103,
    subject: { code: 'abc', fightID: 17, actorId: 63, ilvl: 284.1, killTimeMs: 326876 },
    reference: {
      code: 'xyz',
      fightID: 3,
      name: 'Aidan',
      ilvl: 285,
      killTimeMs: 317924,
      dps: 123456,
    },
    scores: { distance: 0.42, ilvlGap: 0.9, killTimeGapPct: -2.7, rank: 1 },
    pool: { candidatesConsidered: 981, pagesFetched: 10, level: 'close' },
  };
}

describe('parseSubmission', () => {
  it('accepts a well-formed body unchanged', () => {
    const body = validBody();
    expect(parseSubmission(body)).toEqual(body);
  });

  it('accepts every reason in the closed list', () => {
    for (const reason of LABEL_REASONS) {
      expect(parseSubmission({ ...validBody(), reason })).not.toBeNull();
    }
  });

  it('rejects a reason outside the list', () => {
    expect(parseSubmission({ ...validBody(), reason: 'bad-vibes' })).toBeNull();
  });

  it('rejects a comparability level outside the four known ones', () => {
    const body = validBody();
    expect(parseSubmission({ ...body, pool: { ...body.pool, level: 'perfect' } })).toBeNull();
  });

  it('accepts a null ilvl and a null ilvlGap together', () => {
    const body = validBody();
    const parsed = parseSubmission({
      ...body,
      reference: { ...body.reference, ilvl: null },
      scores: { ...body.scores, ilvlGap: null },
    });
    expect(parsed?.reference.ilvl).toBeNull();
    expect(parsed?.scores.ilvlGap).toBeNull();
  });

  it('rejects a missing nested block', () => {
    const body = validBody();
    const { scores, ...withoutScores } = body;
    expect(parseSubmission(withoutScores)).toBeNull();
  });

  it('rejects a numeric field sent as a string', () => {
    const body = validBody();
    expect(parseSubmission({ ...body, encounterId: '3177' })).toBeNull();
  });

  it('rejects a non-finite number', () => {
    const body = validBody();
    expect(
      parseSubmission({ ...body, scores: { ...body.scores, distance: Number.POSITIVE_INFINITY } })
    ).toBeNull();
  });

  it('rejects an empty report code', () => {
    const body = validBody();
    expect(parseSubmission({ ...body, subject: { ...body.subject, code: '' } })).toBeNull();
  });

  it('rejects a non-object', () => {
    expect(parseSubmission(null)).toBeNull();
    expect(parseSubmission('nope')).toBeNull();
    expect(parseSubmission([])).toBeNull();
  });

  // The client must not be able to choose who it is or when this happened.
  it('drops client-supplied v, at and by', () => {
    const parsed = parseSubmission({ ...validBody(), v: 9, at: '1999-01-01', by: 'someone-else' });
    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty('v');
    expect(parsed).not.toHaveProperty('at');
    expect(parsed).not.toHaveProperty('by');
  });
});

describe('monthKey', () => {
  it('buckets by calendar month', () => {
    expect(monthKey('2026-08-06T09:14:22.000Z')).toBe('labels:comparability:2026-08');
    expect(monthKey('2026-12-31T23:59:59.999Z')).toBe('labels:comparability:2026-12');
  });
});
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `npx vitest run src/lib/labels/__tests__/schema.test.ts`
Expected: FAIL — `Failed to resolve import "../schema"`.

- [ ] **Step 3: Écrire le schéma**

Créer `src/lib/labels/schema.ts` :

```ts
import type { ComparabilityLevel } from '@/lib/wcl/comparability';

export const LABEL_REASONS = ['externals', 'set-bonus', 'kill-time', 'ilvl', 'other'] as const;
export type LabelReason = (typeof LABEL_REASONS)[number];

const LEVELS: ComparabilityLevel[] = ['close', 'approximate', 'poor', 'none'];

/** Ce que le client envoie. Il ne choisit ni qui il est ni quand cela s'est produit. */
export interface LabelSubmission {
  reason: LabelReason;
  encounterId: number;
  difficulty: number;
  specId: number;
  subject: { code: string; fightID: number; actorId: number; ilvl: number; killTimeMs: number };
  reference: {
    code: string;
    fightID: number;
    name: string;
    ilvl: number | null;
    killTimeMs: number;
    dps: number;
  };
  /** Écarts signés, référence − sujet. */
  scores: { distance: number; ilvlGap: number | null; killTimeGapPct: number; rank: number };
  pool: { candidatesConsidered: number; pagesFetched: number; level: ComparabilityLevel };
}

/**
 * Ce qui est écrit dans le corpus.
 *
 * `v` n'est pas décoratif : le corpus survivra à plusieurs versions du code, et sans lui
 * on ne saura plus dans un an ce que signifiaient les enregistrements d'aujourd'hui.
 */
export interface ComparabilityLabel extends LabelSubmission {
  v: 1;
  at: string;
  /** SHA-256 salé de l'identifiant de session. Jamais l'e-mail. */
  by: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function nullableNum(v: unknown): v is number | null {
  return v === null || num(v);
}

function str(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/**
 * Valide un corps entrant champ par champ et renvoie une soumission propre, ou `null`.
 *
 * Le corps arrive du navigateur et finit dans un corpus permanent qu'on ne peut pas
 * nettoyer après coup : rien n'est recopié sans avoir été vérifié, et les champs que le
 * serveur possède — `v`, `at`, `by` — ne sont jamais repris de l'entrée.
 */
export function parseSubmission(input: unknown): LabelSubmission | null {
  if (!isRecord(input)) return null;

  const { reason, encounterId, difficulty, specId, subject, reference, scores, pool } = input;

  if (!str(reason) || !(LABEL_REASONS as readonly string[]).includes(reason)) return null;
  if (!num(encounterId) || !num(difficulty) || !num(specId)) return null;

  if (!isRecord(subject)) return null;
  if (!str(subject.code) || !num(subject.fightID) || !num(subject.actorId)) return null;
  if (!num(subject.ilvl) || !num(subject.killTimeMs)) return null;

  if (!isRecord(reference)) return null;
  if (!str(reference.code) || !num(reference.fightID) || !str(reference.name)) return null;
  if (!nullableNum(reference.ilvl) || !num(reference.killTimeMs) || !num(reference.dps)) return null;

  if (!isRecord(scores)) return null;
  if (!num(scores.distance) || !nullableNum(scores.ilvlGap)) return null;
  if (!num(scores.killTimeGapPct) || !num(scores.rank)) return null;

  if (!isRecord(pool)) return null;
  if (!num(pool.candidatesConsidered) || !num(pool.pagesFetched)) return null;
  if (!str(pool.level) || !(LEVELS as string[]).includes(pool.level)) return null;

  return {
    reason: reason as LabelReason,
    encounterId,
    difficulty,
    specId,
    subject: {
      code: subject.code,
      fightID: subject.fightID,
      actorId: subject.actorId,
      ilvl: subject.ilvl,
      killTimeMs: subject.killTimeMs,
    },
    reference: {
      code: reference.code,
      fightID: reference.fightID,
      name: reference.name,
      ilvl: reference.ilvl,
      killTimeMs: reference.killTimeMs,
      dps: reference.dps,
    },
    scores: {
      distance: scores.distance,
      ilvlGap: scores.ilvlGap,
      killTimeGapPct: scores.killTimeGapPct,
      rank: scores.rank,
    },
    pool: {
      candidatesConsidered: pool.candidatesConsidered,
      pagesFetched: pool.pagesFetched,
      level: pool.level as ComparabilityLevel,
    },
  };
}

/** `2026-08-06T09:14:22.000Z` → `labels:comparability:2026-08`. */
export function monthKey(isoTimestamp: string): string {
  return `labels:comparability:${isoTimestamp.slice(0, 7)}`;
}
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Run: `npx vitest run src/lib/labels/__tests__/schema.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Les quatre commandes, puis commit**

```bash
pnpm typecheck && pnpm test && pnpm lint && pnpm format:check
git add src/lib/labels/schema.ts src/lib/labels/__tests__/schema.test.ts
git commit -m "feat(labels): versioned schema and server-side validation for comparability labels"
```

---

## Task 2: L'identité hachée et l'écriture append-only

**Files:**
- Create: `src/lib/labels/identity.ts`
- Modify: `src/lib/redis.ts`
- Test: `src/lib/labels/__tests__/identity.test.ts`, `src/lib/__tests__/redis.test.ts`

**Interfaces:**
- Produces: `hashUserId(userId: string): string` — lève une `Error` si `LABEL_SALT` est absent ou vide. `redisAppend(key: string, value: string): Promise<number>` — rend la longueur de la liste après ajout, lève si Redis n'a pas rendu de longueur.

`src/lib/redis.ts` contient déjà un `exec<T>(cmd: unknown[])` générique et non exporté, plus `redisGet` et `redisSet`. Ajouter `redisAppend` à côté, sans modifier `exec` ni les deux autres.

- [ ] **Step 1: Écrire les tests d'identité qui échouent**

Créer `src/lib/labels/__tests__/identity.test.ts` :

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashUserId } from '../identity';

describe('hashUserId', () => {
  const original = process.env.LABEL_SALT;

  beforeEach(() => {
    process.env.LABEL_SALT = 'pepper';
  });

  afterEach(() => {
    if (original === undefined) delete process.env.LABEL_SALT;
    else process.env.LABEL_SALT = original;
  });

  it('is stable for the same input', () => {
    expect(hashUserId('someone@example.com')).toBe(hashUserId('someone@example.com'));
  });

  it('differs for different inputs', () => {
    expect(hashUserId('a@example.com')).not.toBe(hashUserId('b@example.com'));
  });

  it('never returns the input itself', () => {
    expect(hashUserId('someone@example.com')).not.toContain('someone');
  });

  it('returns 32 hex characters', () => {
    expect(hashUserId('someone@example.com')).toMatch(/^[0-9a-f]{32}$/);
  });

  it('changes when the salt changes', () => {
    const withPepper = hashUserId('someone@example.com');
    process.env.LABEL_SALT = 'other';
    expect(hashUserId('someone@example.com')).not.toBe(withPepper);
  });

  // Fail closed: a corpus mixing salted and unsalted identifiers is a corpus we can no
  // longer certify as free of personal data, and it cannot be cleaned up after the fact.
  it('throws rather than falling back when the salt is missing', () => {
    delete process.env.LABEL_SALT;
    expect(() => hashUserId('someone@example.com')).toThrow(/LABEL_SALT/);
  });

  it('throws when the salt is empty', () => {
    process.env.LABEL_SALT = '';
    expect(() => hashUserId('someone@example.com')).toThrow(/LABEL_SALT/);
  });
});
```

- [ ] **Step 2: Lancer et vérifier l'échec**

Run: `npx vitest run src/lib/labels/__tests__/identity.test.ts`
Expected: FAIL — `Failed to resolve import "../identity"`.

- [ ] **Step 3: Écrire l'identité**

Créer `src/lib/labels/identity.ts` :

```ts
import { createHash } from 'node:crypto';

/**
 * L'identifiant stable et anonyme d'un utilisateur dans le corpus.
 *
 * Suffit à dédupliquer et à repérer un abus, sans mettre d'adresse e-mail dans un jeu de
 * données destiné à durer. Sans sel, on refuse d'écrire : mélanger des identifiants salés
 * et non salés rendrait le corpus impossible à certifier, et c'est irréversible.
 */
export function hashUserId(userId: string): string {
  const salt = process.env.LABEL_SALT;
  if (!salt) {
    throw new Error('LABEL_SALT is not set; refusing to write an unsalted identifier');
  }
  return createHash('sha256').update(`${salt}:${userId}`).digest('hex').slice(0, 32);
}
```

- [ ] **Step 4: Lancer et vérifier le succès**

Run: `npx vitest run src/lib/labels/__tests__/identity.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Écrire le test de `redisAppend` qui échoue**

Ajouter à `src/lib/__tests__/redis.test.ts`, à l'intérieur du `describe` existant (lire le fichier d'abord pour reprendre son style de mock de `globalThis.fetch`) :

```ts
  it('appends with RPUSH and returns the new list length', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 7 }),
    } as Response);
    globalThis.fetch = fetchMock;

    await expect(redisAppend('labels:comparability:2026-08', '{"v":1}')).resolves.toBe(7);

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body).toEqual(['RPUSH', 'labels:comparability:2026-08', '{"v":1}']);
  });

  // exec() does not check res.ok, so a failed write would otherwise resolve to undefined
  // and the route would answer 200 for a label that was never stored.
  it('throws when Redis does not return a list length', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'ERR wrong number of arguments' }),
    } as Response);

    await expect(redisAppend('k', 'v')).rejects.toThrow(/list length/);
  });
```

Ajouter `redisAppend` à l'import existant en tête du fichier.

- [ ] **Step 6: Lancer et vérifier l'échec**

Run: `npx vitest run src/lib/__tests__/redis.test.ts`
Expected: FAIL — `redisAppend is not a function` (ou une erreur d'import).

- [ ] **Step 7: Ajouter `redisAppend`**

Dans `src/lib/redis.ts`, après `redisSet` :

```ts
/**
 * Ajoute en fin de liste. Append-only : pas de lecture préalable, donc deux écritures
 * concurrentes ne peuvent pas s'écraser l'une l'autre — ce que le read-modify-write des
 * routes `user/*` ne garantit pas, et qu'un corpus non reconstituable ne peut pas se
 * permettre.
 *
 * `exec` ne vérifie pas `res.ok` ; on valide donc ici que Redis a bien rendu une longueur,
 * faute de quoi une écriture échouée passerait pour un succès.
 */
export async function redisAppend(key: string, value: string): Promise<number> {
  const length = await exec<number | null>(['RPUSH', key, value]);
  if (typeof length !== 'number' || !Number.isFinite(length)) {
    throw new Error(`RPUSH ${key} did not return a list length`);
  }
  return length;
}
```

- [ ] **Step 8: Lancer et vérifier le succès**

Run: `npx vitest run src/lib/__tests__/redis.test.ts src/lib/labels/__tests__/identity.test.ts`
Expected: PASS.

- [ ] **Step 9: Les quatre commandes, puis commit**

```bash
pnpm typecheck && pnpm test && pnpm lint && pnpm format:check
git add src/lib/labels/identity.ts src/lib/labels/__tests__/identity.test.ts src/lib/redis.ts src/lib/__tests__/redis.test.ts
git commit -m "feat(labels): salted identity and append-only redis write"
```

---

## Task 3: Faire circuler la provenance jusqu'à l'écran

Sans cette tâche, l'écran ne peut pas décrire ce qu'il étiquette : `TopPlayer` ne porte que des stats, et `BossResult` ne dit ni d'où vient le combat analysé ni à quelle difficulté.

**Files:**
- Modify: `src/types/index.ts`, `src/lib/wcl/references.ts`, `src/lib/wcl/pipeline.ts`, `src/lib/wcl/report-pipeline.ts`
- Test: `src/lib/wcl/__tests__/references.test.ts`

**Interfaces:**
- Consumes: `ScoredCandidate<T>` depuis `@/lib/wcl/comparability` — `{ candidate: T; distance: number }`.
- Produces:
  - `ReferenceProvenance = { code: string; fightID: number; name: string; ilvl: number | null; killTimeMs: number; dps: number; distance: number }`
  - `TopPlayer` gagne `provenance: ReferenceProvenance`
  - `BossResult.character` gagne `source: { code: string; fightID: number; actorId: number }`
  - `BossResult` gagne `difficulty: number`
  - `ReferenceSelection.references` devient `ScoredCandidate<WorldRanking>[]`
  - `fetchReferencePlayers(token: string, pool: ScoredCandidate<WorldRanking>[]): Promise<TopPlayer[]>`

**Pourquoi `ilvl` vient du classement et non des stats calculées.** `TopPlayer.stats.avgIlvl` est l'ilvl recalculé depuis l'équipement ; la sélection, elle, a marqué sur `bracketData`, l'ilvl du classement. Le corpus doit enregistrer **ce que la sélection a vu** : un enregistrement où l'écart consigné ne se déduit pas des entrées consignées est incohérent. `ReferenceProvenance.ilvl` est donc `candidate.bracketData ?? null`.

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `src/lib/wcl/__tests__/references.test.ts`, le `describe('fetchReferencePlayers')` construit ses candidats avec le helper de tête de fichier `ranking(name, duration, amount)`. `fetchReferencePlayers` prenant désormais des candidats **scorés**, envelopper les appels. Remplacer le test nominal existant `'builds a reference player from the ranking and the fight data'` par :

```ts
  it('builds a reference player from the ranking and the fight data', async () => {
    mockCandidateQueries();

    const candidate = { ...ranking('Aidan', 263000, 310000), bracketData: 285 };
    const [player] = await fetchReferencePlayers('token', [{ candidate, distance: 0.42 }]);

    expect(player.stats.name).toBe('Aidan');
    expect(player.stats.dps).toBe(310000);
    expect(player.stats.killTime).toBe('4:23');
    // 640, Aidan's own gear — not 600, which is the other Feral's and what matching
    // on spec would have returned. This is the item level the selection is built on.
    expect(player.stats.avgIlvl).toBe(640);
    expect(player.rotation.dps).toBe(310000);
    expect(player.damageTable.entries).toEqual([
      { name: 'Ferocious Bite', total: 900 },
      { name: 'Rip', total: 100 },
    ]);
  });
```

Puis ajouter, dans le même `describe`, deux cas sur la provenance :

```ts
  it('carries the provenance the corpus needs, ilvl from the ranking', async () => {
    mockCandidateQueries();

    const candidate = { ...ranking('Aidan', 263000, 310000), bracketData: 285 };
    const [player] = await fetchReferencePlayers('token', [{ candidate, distance: 0.42 }]);

    expect(player.provenance).toEqual({
      code: 'code-Aidan',
      fightID: 1,
      name: 'Aidan',
      // The ranking's bracketData, not stats.avgIlvl (640) — the selection scored on this.
      ilvl: 285,
      killTimeMs: 263000,
      dps: 310000,
      distance: 0.42,
    });
  });

  it('records a null ilvl when the ranking entry has no bracketData', async () => {
    mockCandidateQueries();

    const [player] = await fetchReferencePlayers('token', [
      { candidate: ranking('Aidan', 263000, 310000), distance: 3 },
    ]);

    expect(player.provenance.ilvl).toBeNull();
  });
```

Adapter aussi les deux autres cas du même `describe` à la nouvelle forme :

```ts
  it('drops a candidate it cannot identify rather than substituting another player', async () => {
    mockCandidateQueries();

    const players = await fetchReferencePlayers('token', [
      { candidate: ranking('Inconnu', 263000), distance: 1 },
    ]);

    expect(players).toEqual([]);
  });

  it('skips candidates with an unusable report reference', async () => {
    mockCandidateQueries();

    const players = await fetchReferencePlayers('token', [
      {
        candidate: { name: 'Ghost', amount: 1, duration: 1000, report: { code: '', fightID: 0 } },
        distance: 1,
      },
    ]);

    expect(players).toEqual([]);
  });
```

Enfin, dans `describe('selectReferences')`, les assertions qui lisent `references.map((r) => r.name)` doivent lire `references.map((r) => r.candidate.name)`. Il y en a quatre : `'prefers the closest candidate over the highest-dps one'`, `'caps the pool at TOP_N, keeping the closest'`, `'still returns references when none is within tolerance'`, `'keeps a candidate that shares the report code but not the fightID'`. Le cas `'excludes the player own log…'` lit lui aussi `references.map((r) => r.name)` — même correction.

- [ ] **Step 2: Lancer et vérifier l'échec**

Run: `npx vitest run src/lib/wcl/__tests__/references.test.ts`
Expected: FAIL — `player.provenance` vaut `undefined`, et les assertions sur `r.candidate.name` échouent tant que `selectReferences` rend des `WorldRanking`.

- [ ] **Step 3: Étendre les types**

Dans `src/types/index.ts`, remplacer l'interface `TopPlayer` (aujourd'hui lignes 68-72) par :

```ts
/**
 * D'où vient une référence et ce que la sélection a vu d'elle.
 *
 * `ilvl` est le `bracketData` du classement — l'ilvl sur lequel la distance a été
 * calculée — et non `stats.avgIlvl`, qui est recalculé depuis l'équipement. Le corpus
 * doit pouvoir redériver l'écart consigné à partir des entrées consignées.
 */
export interface ReferenceProvenance {
  code: string;
  fightID: number;
  name: string;
  ilvl: number | null;
  killTimeMs: number;
  dps: number;
  distance: number;
}

export interface TopPlayer {
  stats: CharacterStats & { dps: number; killTime: string };
  rotation: RotationSummary;
  damageTable: { entries: DamageEntry[] };
  provenance: ReferenceProvenance;
}
```

Dans `BossResult`, ajouter `difficulty: number;` juste après `specId: number;`, et à l'intérieur du bloc `character`, après `bracket: number | null;` :

```ts
    /** Le combat analysé, pour que l'écran puisse nommer ce qu'il étiquette. */
    source: { code: string; fightID: number; actorId: number };
```

- [ ] **Step 4: Faire circuler la provenance dans `references.ts`**

Dans `src/lib/wcl/references.ts` :

1. Ajouter `ScoredCandidate` à l'import de type existant depuis `./comparability` (l'import de valeur `selectClosest`, `comparabilityLevel`, `medianOf` reste tel quel ; le linter place les imports de type comme il l'entend).
2. `ReferenceSelection.references` devient `ScoredCandidate<WorldRanking>[]`.
3. Dans `selectReferences`, supprimer `const references = scored.map((s) => s.candidate);` et rendre `{ references: scored, comparability }`. Le calcul de `comparability` lit désormais les candidats à travers `scored` :

```ts
  const comparability: Comparability = {
    level: comparabilityLevel(scored),
    referenceIlvl: medianOf(
      scored.map((s) => s.candidate.bracketData).filter((v): v is number => v !== undefined)
    ),
    myIlvl,
    referenceKillTimeMs: medianOf(scored.map((s) => s.candidate.duration)),
    myKillTimeMs,
    candidatesConsidered: filtered.length,
    pagesFetched: pool.pagesFetched,
  };

  return { references: scored, comparability };
```

4. `fetchReferencePlayers` prend des candidats scorés et pose la provenance :

```ts
export async function fetchReferencePlayers(
  token: string,
  pool: ScoredCandidate<WorldRanking>[]
): Promise<TopPlayer[]> {
  const players: TopPlayer[] = [];

  for (const { candidate, distance } of pool) {
    const { code, fightID } = candidate.report;
    if (!code || !fightID) continue;

    // By name, not by spec: the ranking names one player, but a raid can field two of
    // the same spec. Matching on spec returned whichever came first, so the panel could
    // show this candidate's name and damage beside another player's gear, talents and
    // rotation — including the item level the whole selection is built on. A candidate
    // we cannot identify is dropped rather than substituted.
    const combatant = await findCombatantByName(token, code, fightID, candidate.name);
    if (!combatant) continue;

    const dps = Math.round(candidate.amount);
    const { stats, rotation, damageEntries } = await fetchFightData(token, {
      code,
      fightId: fightID,
      combatant,
      name: candidate.name,
      fightMs: candidate.duration,
      dps,
    });

    players.push({
      stats: { ...stats, dps, killTime: fmtMs(candidate.duration) },
      rotation,
      damageTable: { entries: damageEntries },
      provenance: {
        code,
        fightID,
        name: candidate.name,
        ilvl: candidate.bracketData ?? null,
        killTimeMs: candidate.duration,
        dps,
        distance,
      },
    });
  }

  return players;
}
```

- [ ] **Step 5: Renseigner le sujet et la difficulté dans les deux pipelines**

Dans `src/lib/wcl/pipeline.ts`, à l'intérieur de l'objet retourné, ajouter `difficulty,` après `specId: charEvent.specID,` et, dans le bloc `character`, après `bracket: best.bracketData,` :

```ts
      source: { code: bestCode, fightID: bestFightId, actorId: charEvent.sourceID },
```

Dans `src/lib/wcl/report-pipeline.ts`, même chose : `difficulty,` après `specId: charEvent.specID,` et, après `bracket: myDpsRank ? Math.round(myDpsRank.bracketData * 10) / 10 : null,` :

```ts
      source: { code, fightID: fightId, actorId: charEvent.sourceID },
```

`difficulty` est déjà un paramètre des deux fonctions — il est passé à `fetchCandidatePool`. Si le nom local diffère, utiliser `difficulty: <nom local>`.

- [ ] **Step 6: Lancer les tests et corriger les retombées de typage**

Run: `pnpm typecheck && npx vitest run src/lib/wcl`
Expected: PASS. Tout appelant de `fetchReferencePlayers` ou constructeur de `TopPlayer`/`BossResult` dans les tests existants doit être mis en conformité — ne pas relâcher une assertion pour faire passer, ajouter le champ manquant.

- [ ] **Step 7: Les quatre commandes, puis commit**

```bash
pnpm typecheck && pnpm test && pnpm lint && pnpm format:check
git add src/types/index.ts src/lib/wcl/references.ts src/lib/wcl/pipeline.ts src/lib/wcl/report-pipeline.ts src/lib/wcl/__tests__/references.test.ts
git commit -m "feat(wcl): carry reference provenance and fight source to the screen"
```

---

## Task 4: La route d'écriture

**Files:**
- Create: `src/app/api/labels/comparability/route.ts`
- Test: `src/app/api/labels/comparability/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `parseSubmission`, `monthKey`, `ComparabilityLabel` (Task 1) ; `hashUserId` (Task 2) ; `redisAppend` (Task 2) ; `authOptions` depuis `@/lib/auth`.
- Produces: `POST` sur `/api/labels/comparability`.

Suivre le motif des routes existantes `src/app/api/user/*/route.ts` : `export const runtime = 'nodejs'`, `getServerSession(authOptions)`, identifiant utilisateur `session.user.email ?? session.user.name`. Lire `src/app/api/user/favourites/__tests__/route.test.ts` pour reprendre la façon dont ces tests simulent `next-auth`.

Codes de retour, exhaustifs : **401** sans session, **400** sur JSON illisible ou corps invalide, **503** si `LABEL_SALT` manque ou si Redis échoue, **200** avec `{ ok: true, length }` sinon.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `src/app/api/labels/comparability/__tests__/route.test.ts` :

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../route';

const { getServerSession, redisAppend } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  redisAppend: vi.fn(),
}));

vi.mock('next-auth/next', () => ({ getServerSession }));
vi.mock('@/lib/redis', () => ({ redisAppend }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

function body(overrides: Record<string, unknown> = {}) {
  return {
    reason: 'externals',
    encounterId: 3177,
    difficulty: 5,
    specId: 103,
    subject: { code: 'abc', fightID: 17, actorId: 63, ilvl: 284.1, killTimeMs: 326876 },
    reference: {
      code: 'xyz',
      fightID: 3,
      name: 'Aidan',
      ilvl: 285,
      killTimeMs: 317924,
      dps: 123456,
    },
    scores: { distance: 0.42, ilvlGap: 0.9, killTimeGapPct: -2.7, rank: 1 },
    pool: { candidatesConsidered: 981, pagesFetched: 10, level: 'close' },
    ...overrides,
  };
}

function request(payload: unknown) {
  return new Request('http://localhost/api/labels/comparability', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as never;
}

describe('POST /api/labels/comparability', () => {
  const originalSalt = process.env.LABEL_SALT;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LABEL_SALT = 'pepper';
    getServerSession.mockResolvedValue({ user: { email: 'someone@example.com' } });
    redisAppend.mockResolvedValue(1);
  });

  afterEach(() => {
    if (originalSalt === undefined) delete process.env.LABEL_SALT;
    else process.env.LABEL_SALT = originalSalt;
  });

  it('stores a valid label and reports the new list length', async () => {
    const res = await POST(request(body()));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, length: 1 });
    expect(redisAppend).toHaveBeenCalledTimes(1);
  });

  it('writes to the month bucket of the current time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-06T09:14:22.000Z'));

    await POST(request(body()));

    expect(redisAppend.mock.calls[0][0]).toBe('labels:comparability:2026-08');
    vi.useRealTimers();
  });

  it('stamps v, at and a hashed by that is not the email', async () => {
    await POST(request(body()));

    const stored = JSON.parse(String(redisAppend.mock.calls[0][1]));
    expect(stored.v).toBe(1);
    expect(typeof stored.at).toBe('string');
    expect(stored.by).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(stored)).not.toContain('someone@example.com');
  });

  it('ignores a client-supplied identity and timestamp', async () => {
    await POST(request(body({ v: 9, at: '1999-01-01T00:00:00.000Z', by: 'someone-else' })));

    const stored = JSON.parse(String(redisAppend.mock.calls[0][1]));
    expect(stored.v).toBe(1);
    expect(stored.by).not.toBe('someone-else');
    expect(stored.at).not.toBe('1999-01-01T00:00:00.000Z');
  });

  it('rejects an unauthenticated caller', async () => {
    getServerSession.mockResolvedValue(null);

    const res = await POST(request(body()));

    expect(res.status).toBe(401);
    expect(redisAppend).not.toHaveBeenCalled();
  });

  it('rejects an invalid body', async () => {
    const res = await POST(request(body({ reason: 'bad-vibes' })));

    expect(res.status).toBe(400);
    expect(redisAppend).not.toHaveBeenCalled();
  });

  it('rejects an unparseable body', async () => {
    const bad = new Request('http://localhost/api/labels/comparability', {
      method: 'POST',
      body: 'not json',
    }) as never;

    const res = await POST(bad);

    expect(res.status).toBe(400);
    expect(redisAppend).not.toHaveBeenCalled();
  });

  // Fail closed: never write an unsalted identifier into a corpus we cannot clean up.
  it('refuses to write when the salt is missing', async () => {
    delete process.env.LABEL_SALT;

    const res = await POST(request(body()));

    expect(res.status).toBe(503);
    expect(redisAppend).not.toHaveBeenCalled();
  });

  it('reports a storage failure rather than claiming success', async () => {
    redisAppend.mockRejectedValue(new Error('upstash down'));

    const res = await POST(request(body()));

    expect(res.status).toBe(503);
  });
});
```

- [ ] **Step 2: Lancer et vérifier l'échec**

Run: `npx vitest run src/app/api/labels/comparability/__tests__/route.test.ts`
Expected: FAIL — `Failed to resolve import "../route"`.

- [ ] **Step 3: Écrire la route**

Créer `src/app/api/labels/comparability/route.ts` :

```ts
import type { NextRequest } from 'next/server';
import type { ComparabilityLabel } from '@/lib/labels/schema';
import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { hashUserId } from '@/lib/labels/identity';
import { monthKey, parseSubmission } from '@/lib/labels/schema';
import { redisAppend } from '@/lib/redis';

export const runtime = 'nodejs';

/**
 * Enregistre une décision « pas comparable ».
 *
 * Aucune réponse ne prétend qu'une écriture a eu lieu si elle n'a pas eu lieu : un clic
 * perdu est une donnée perdue, et le corpus est la seule chose que ce produit ne peut pas
 * reconstituer plus tard.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.email ?? session?.user?.name ?? '';
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const submission = parseSubmission(raw);
  if (!submission) {
    return NextResponse.json({ error: 'Invalid label' }, { status: 400 });
  }

  let by: string;
  try {
    by = hashUserId(userId);
  } catch {
    return NextResponse.json({ error: 'Label capture unavailable' }, { status: 503 });
  }

  const at = new Date().toISOString();
  const label: ComparabilityLabel = { v: 1, at, by, ...submission };

  try {
    const length = await redisAppend(monthKey(at), JSON.stringify(label));
    return NextResponse.json({ ok: true, length });
  } catch {
    return NextResponse.json({ error: 'Label capture unavailable' }, { status: 503 });
  }
}
```

- [ ] **Step 4: Lancer et vérifier le succès**

Run: `npx vitest run src/app/api/labels/comparability/__tests__/route.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Documenter la variable d'environnement**

Ajouter à la fin de `.env.example` :

```
# Label capture — salt for the anonymous user identifier stored with each
# "not comparable" ruling. Any long random string; generate with:
#   openssl rand -hex 32
# Without it the label route refuses to write rather than storing an unsalted
# identifier, which would make the corpus impossible to certify afterwards.
LABEL_SALT=
```

- [ ] **Step 6: Les quatre commandes, puis commit**

```bash
pnpm typecheck && pnpm test && pnpm lint && pnpm format:check
git add src/app/api/labels/comparability .env.example
git commit -m "feat(labels): append-only capture endpoint for comparability rulings"
```

---

## Task 5: Le contrôle « pas comparable »

**Files:**
- Create: `src/components/results/ReferenceLabels.tsx`
- Modify: `src/components/results/ComparisonTab.tsx`
- Test: `src/components/results/__tests__/ReferenceLabels.test.tsx`

**Interfaces:**
- Consumes: `BossResult` et `ReferenceProvenance` depuis `@/types` (Task 3) ; `LABEL_REASONS`, `LabelReason` depuis `@/lib/labels/schema` (Task 1) ; la route `POST /api/labels/comparability` (Task 4) ; les primitives `Card` et `Button` depuis `@/components/ui/`.
- Produces: `<ReferenceLabels result={result} />`.

Lire `src/components/ui/Button.tsx` pour les variantes et tailles disponibles avant d'écrire, et `src/components/results/ComparabilityBanner.tsx` comme modèle de style — c'est le composant voisin immédiat.

**Placement** : dans `ComparisonTab`, **juste après** le bloc qui rend `ComparabilityBanner` et avant celui de « Stats vs top players ». Le bandeau énonce sur quelle base la comparaison est faite ; ce contrôle permet de la contester. Les deux se lisent ensemble.

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `src/components/results/__tests__/ReferenceLabels.test.tsx` :

```tsx
import type { BossResult, ReferenceProvenance, TopPlayer } from '@/types';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReferenceLabels } from '../ReferenceLabels';

function provenance(name: string, rank: number): ReferenceProvenance {
  return {
    code: `code-${name}`,
    fightID: rank,
    name,
    ilvl: 285,
    killTimeMs: 317924,
    dps: 123456,
    distance: 0.42,
  };
}

function topPlayer(name: string, rank: number): TopPlayer {
  return {
    stats: {
      name,
      avgIlvl: 285,
      primaryStat: 0,
      crit: 0,
      haste: 0,
      mastery: 0,
      vers: 0,
      talents: {},
      dps: 123456,
      killTime: '5:17',
    },
    rotation: { name, dps: 123456, fightDurationMs: 317924, casts: {}, buffs: {} },
    damageTable: { entries: [] },
    provenance: provenance(name, rank),
  };
}

function result(): BossResult {
  return {
    encounter: 'Vorasius',
    encounterId: 3177,
    difficulty: 5,
    specId: 103,
    fightTargets: [],
    character: {
      stats: {
        name: 'Jumbaa',
        avgIlvl: 284.1,
        primaryStat: 0,
        crit: 0,
        haste: 0,
        mastery: 0,
        vers: 0,
        talents: {},
      },
      rotation: { name: 'Jumbaa', dps: 105538, fightDurationMs: 326876, casts: {}, buffs: {} },
      damageTable: { entries: [] },
      dps: 105538,
      bossDps: null,
      killTime: '5:26',
      overallPct: null,
      overallPctOf: null,
      todayPct: null,
      bossDpsPct: null,
      bracket: null,
      source: { code: 'abc', fightID: 17, actorId: 63 },
    },
    topPlayers: [topPlayer('Aidan', 1), topPlayer('Baldan', 2)],
    comparability: {
      level: 'close',
      referenceIlvl: 285,
      myIlvl: 284.1,
      referenceKillTimeMs: 317924,
      myKillTimeMs: 326876,
      candidatesConsidered: 981,
      pagesFetched: 10,
    },
  };
}

describe('referenceLabels', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, length: 1 }),
    } as Response);
  });

  it('lists every reference by name', () => {
    render(<ReferenceLabels result={result()} />);

    expect(screen.getByText('Aidan')).toBeInTheDocument();
    expect(screen.getByText('Baldan')).toBeInTheDocument();
  });

  it('shows the reasons only after the reference is challenged', async () => {
    const user = userEvent.setup();
    render(<ReferenceLabels result={result()} />);

    expect(screen.queryByRole('button', { name: 'Externals' })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Not comparable' })[0]);

    expect(screen.getByRole('button', { name: 'Externals' })).toBeInTheDocument();
  });

  it('posts the chosen reason with the right reference and signed gaps', async () => {
    const user = userEvent.setup();
    render(<ReferenceLabels result={result()} />);

    await user.click(screen.getAllByRole('button', { name: 'Not comparable' })[1]);
    await user.click(screen.getByRole('button', { name: 'Kill time' }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/labels/comparability');
    const sent = JSON.parse(String((init as RequestInit).body));

    expect(sent.reason).toBe('kill-time');
    expect(sent.reference.name).toBe('Baldan');
    expect(sent.scores.rank).toBe(2);
    expect(sent.subject).toEqual({
      code: 'abc',
      fightID: 17,
      actorId: 63,
      ilvl: 284.1,
      killTimeMs: 326876,
    });
    // Signed, reference − subject: these references are better geared and faster.
    expect(sent.scores.ilvlGap).toBeCloseTo(0.9, 5);
    expect(sent.scores.killTimeGapPct).toBeLessThan(0);
    expect(sent.pool).toEqual({ candidatesConsidered: 981, pagesFetched: 10, level: 'close' });
  });

  it('marks the reference as recorded once the write succeeds', async () => {
    const user = userEvent.setup();
    render(<ReferenceLabels result={result()} />);

    await user.click(screen.getAllByRole('button', { name: 'Not comparable' })[0]);
    await user.click(screen.getByRole('button', { name: 'Externals' }));

    expect(await screen.findByText('Recorded')).toBeInTheDocument();
  });

  // A lost click is a lost datum — never let a failed write look like a success.
  it('surfaces a failed write and allows a retry', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response);
    const user = userEvent.setup();
    render(<ReferenceLabels result={result()} />);

    await user.click(screen.getAllByRole('button', { name: 'Not comparable' })[0]);
    await user.click(screen.getByRole('button', { name: 'Externals' }));

    expect(await screen.findByText(/could not be saved/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Externals' })).toBeInTheDocument();
  });

  it('renders nothing when there are no references', () => {
    const empty = { ...result(), topPlayers: [] };
    const { container } = render(<ReferenceLabels result={empty} />);

    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Lancer et vérifier l'échec**

Run: `npx vitest run src/components/results/__tests__/ReferenceLabels.test.tsx`
Expected: FAIL — `Failed to resolve import "../ReferenceLabels"`.

- [ ] **Step 3: Écrire le composant**

Créer `src/components/results/ReferenceLabels.tsx` :

```tsx
'use client';

import type { BossResult } from '@/types';
import type { LabelReason } from '@/lib/labels/schema';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LABEL_REASONS } from '@/lib/labels/schema';

const REASON_LABELS: Record<LabelReason, string> = {
  'externals': 'Externals',
  'set-bonus': 'Set bonus',
  'kill-time': 'Kill time',
  'ilvl': 'Item level',
  'other': 'Other',
};

type Status = 'idle' | 'choosing' | 'sending' | 'done' | 'error';

interface ReferenceLabelsProps {
  result: BossResult;
}

export function ReferenceLabels({ result }: ReferenceLabelsProps) {
  const [status, setStatus] = useState<Record<number, Status>>({});

  if (result.topPlayers.length === 0) return null;

  const { character, comparability } = result;

  async function submit(rank: number, reason: LabelReason) {
    const player = result.topPlayers[rank - 1];
    const { provenance } = player;

    setStatus((s) => ({ ...s, [rank]: 'sending' }));

    const body = {
      reason,
      encounterId: result.encounterId,
      difficulty: result.difficulty,
      specId: result.specId,
      subject: {
        ...character.source,
        ilvl: comparability.myIlvl,
        killTimeMs: comparability.myKillTimeMs,
      },
      reference: {
        code: provenance.code,
        fightID: provenance.fightID,
        name: provenance.name,
        ilvl: provenance.ilvl,
        killTimeMs: provenance.killTimeMs,
        dps: provenance.dps,
      },
      scores: {
        distance: provenance.distance,
        // Signed, reference − subject: being better geared than your references is not
        // the same situation as the reverse, and an absolute value loses that.
        ilvlGap: provenance.ilvl === null ? null : provenance.ilvl - comparability.myIlvl,
        killTimeGapPct:
          comparability.myKillTimeMs === 0
            ? 0
            : ((provenance.killTimeMs - comparability.myKillTimeMs) / comparability.myKillTimeMs) *
              100,
        rank,
      },
      pool: {
        candidatesConsidered: comparability.candidatesConsidered,
        pagesFetched: comparability.pagesFetched,
        level: comparability.level,
      },
    };

    try {
      const res = await fetch('/api/labels/comparability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setStatus((s) => ({ ...s, [rank]: res.ok ? 'done' : 'error' }));
    } catch {
      setStatus((s) => ({ ...s, [rank]: 'error' }));
    }
  }

  return (
    <Card header="Challenge a reference">
      <ul className="flex flex-col gap-3">
        {result.topPlayers.map((player, i) => {
          const rank = i + 1;
          const state = status[rank] ?? 'idle';

          return (
            <li key={`${player.provenance.code}:${player.provenance.fightID}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs">{player.provenance.name}</span>

                {state === 'idle' && (
                  <Button variant="ghost" size="xs" onClick={() => setStatus((s) => ({ ...s, [rank]: 'choosing' }))}>
                    Not comparable
                  </Button>
                )}

                {state === 'sending' && <span className="text-dim text-2xs">Saving…</span>}
                {state === 'done' && <span className="text-muted text-2xs">Recorded</span>}
              </div>

              {(state === 'choosing' || state === 'error') && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {LABEL_REASONS.map((reason) => (
                    <Button key={reason} variant="secondary" size="xs" onClick={() => submit(rank, reason)}>
                      {REASON_LABELS[reason]}
                    </Button>
                  ))}
                </div>
              )}

              {state === 'error' && (
                <p className="text-danger text-2xs mt-2">
                  That ruling could not be saved. Try again.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
```

Si `Button` n'expose pas la taille `xs` ou la variante `ghost`/`secondary`, **ne pas surcharger via `className`** — la surcharge est silencieusement ignorée par l'ordre de la feuille de style. Utiliser une taille et une variante existantes, ou étendre la primitive.

- [ ] **Step 4: Lancer et vérifier le succès**

Run: `npx vitest run src/components/results/__tests__/ReferenceLabels.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Brancher dans l'onglet Comparaison**

Dans `src/components/results/ComparisonTab.tsx`, après le bloc qui rend `ComparabilityBanner` :

```tsx
      <div className="mt-6">
        <ReferenceLabels result={result} />
      </div>
```

Ajouter l'import `import { ReferenceLabels } from './ReferenceLabels';` auprès des autres imports relatifs.

- [ ] **Step 6: Les quatre commandes, puis commit**

```bash
pnpm typecheck && pnpm test && pnpm lint && pnpm format:check
git add src/components/results/ReferenceLabels.tsx src/components/results/__tests__/ReferenceLabels.test.tsx src/components/results/ComparisonTab.tsx
git commit -m "feat(results): let the reader challenge a reference, with a reason"
```

---

## Vérification finale

Après la dernière tâche, avant la revue de branche. Les tâches ne la couvrent pas.

- [ ] **Le portail complet, build inclus**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
```

- [ ] **Poser une étiquette pour de vrai, puis la relire**

Une étiquette qu'on n'a pas relue n'est pas une étiquette capturée.

1. Renseigner `LABEL_SALT` dans `.env.local` (`openssl rand -hex 32`).
2. Démarrer le serveur avec le stub de session : `PORT=3100 ENABLE_DEV_SESSION=1 pnpm dev`.
3. Ouvrir `http://localhost:3100/?report=gjQ47FLB3Vf9XZDp&actor=63&difficulty=5&spec=102`, onglet **Comparison**, boss **Vorasius**.
4. Cliquer « Not comparable » sur la première référence, choisir **Externals**. L'état doit passer à « Recorded ».
5. Relire la liste et vérifier l'enregistrement :

```bash
curl -s -X POST "$UPSTASH_REDIS_REST_URL" \
  -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '["LRANGE","labels:comparability:2026-08","-1","-1"]'
```

Contrôler dans l'enregistrement rendu : `v` vaut `1` ; `by` fait 32 caractères hexadécimaux et **ne contient aucune adresse e-mail** ; `subject.code` vaut `gjQ47FLB3Vf9XZDp` ; `reference.ilvl` correspond au `bracketData` du classement et non à l'ilvl affiché dans la table de stats ; `scores.ilvlGap` et `scores.killTimeGapPct` sont **signés** et cohérents avec le bandeau.

- [ ] **Les trois largeurs**

Sur le même serveur, vérifier le contrôle à **360**, **768** et **1280** : aucun débordement horizontal du `body`, aucun texte tronqué, tous les boutons atteignables au clavier avec un focus visible. Les tests jsdom ne voient ni media query, ni peinture, ni focus réel — trois défauts de ce projet ont déjà échappé à une suite verte.

- [ ] **Le refus d'écrire sans sel**

Retirer `LABEL_SALT` de `.env.local`, redémarrer, recliquer : l'interface doit afficher l'erreur, et `LRANGE` ne doit pas avoir gagné d'entrée. Remettre le sel ensuite.

- [ ] **Mettre à jour `PRODUCT_CONTEXT.md`**

§7 : D2 affirme que « la capture d'étiquettes n'a pas de substrat ». C'est désormais faux, et sa prémisse l'était déjà — noter que `redis.ts` était un client générique et que le blocage réel était la provenance absente. §8 : la tâche 1 « Capture des étiquettes » est faite ; préciser qu'aucune exploitation n'existe encore et que le choix de stockage reste un Redis append-only, à migrer le jour où il y aura de quoi entraîner.

## Hors périmètre

Aucune exploitation des étiquettes, aucune route de lecture ou d'export, aucun `try/catch` ajouté aux routes `user/*` existantes, et les CGU de l'API WCL sur le stockage de données dérivées restent non tranchées.
