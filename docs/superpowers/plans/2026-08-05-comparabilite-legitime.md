# Comparabilité légitime et visible — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Choose reference logs by how comparable they are to the player rather than by how fast they were, and state on screen how legitimate the resulting comparison is.

**Architecture:** The world-rankings query gains a `page` argument, so a fixed number of pages is fetched in parallel to build a candidate pool of roughly a thousand instead of a hundred. A pure scoring function ranks candidates by combined ilvl and kill-time distance from the player; the closest are kept. The distance of those kept becomes a comparability level carried on `BossResult` and rendered as a banner.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-05-comparabilite-legitime-design.md`

## Global Constraints

- Work directly on `main`. No feature branches.
- Every commit must pass the pre-commit hook: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`. The suite is at **222** tests before this plan.
- Existing tests must pass **unmodified**, with exactly one authorised exception, named in Task 3: three `selectReferencePool` cases assert the kill-time-window-then-fallback behaviour this plan removes. They encode the defect, not a guarantee, and are deleted there deliberately. Every other test that breaks means the change altered behaviour — fix the code, not the test.
- No inline `style={{}}`. Tailwind utility classes only, from the `@theme` block in `src/app/globals.css`. The only exceptions in this codebase are the runtime-computed bar widths in `DamageBreakdown.tsx` and `RotationCards.tsx`.
- No colour, spacing, font-size or radius literal. Use the exact token when one matches; round only when none does.
- **`text-danger` (red) means an illegitimate comparison or an error — never "below the references".** A deviation is `text-deviation` (blue).
- All numerals render in `font-mono`. A numeral inside a sentence is wrapped individually, never by switching the whole sentence.
- Never override a primitive's size classes through `className`. `Button` has sizes `xs`, `sm`, `md`, `lg`.
- Every surface works at 360px with no horizontal overflow.
- `@antfu/eslint-config`: type imports first, then relative imports before aliased ones. `describe` titles are lowercase.
- Exact values, copied from the spec: `ILVL_TOLERANCE = 4`, `KILL_TIME_TOLERANCE = 0.2` (unchanged), `TOP_N = 3` (unchanged), `CANDIDATE_PAGES = 10`.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `src/lib/wcl/comparability.ts` | Pure scoring: candidate distance, selection by proximity, comparability level. No network. |
| `src/lib/wcl/__tests__/comparability.test.ts` | Its tests. |
| `src/components/results/ComparabilityBanner.tsx` | Renders the comparability block above the comparison. |
| `src/components/results/__tests__/ComparabilityBanner.test.tsx` | Its tests. |

**Modified**

| File | Change |
|---|---|
| `src/lib/wcl/queries.ts` | `Q_WORLD_RANKINGS` accepts `page` |
| `src/lib/wcl/constants.ts` | `ILVL_TOLERANCE`, `CANDIDATE_PAGES` |
| `src/lib/wcl/references.ts` | `WorldRanking` gains `bracketData`; `fetchCandidatePool` added; `selectReferencePool` delegates to `comparability.ts` |
| `src/types/index.ts` | `Comparability` interface, carried by `BossResult` |
| `src/lib/wcl/pipeline.ts`, `src/lib/wcl/report-pipeline.ts` | fetch the pool, pass the player's ilvl, assemble the block |
| `src/components/results/ComparisonTab.tsx` | renders the banner |

**Divergence assumée par rapport au spec.** Its §6 puts `scoreCandidates` inside
`references.ts`. This plan gives scoring its own file instead, because it is pure while
`references.ts` does network work — the same split that already separates `src/lib/comparison/`
from the components rendering it, and what makes the scoring testable without mocking `fetch`.
Nothing else about the spec changes.

---

## Task 1: Tokens for the candidate pool

**Files:**
- Modify: `src/lib/wcl/constants.ts`
- Modify: `src/lib/wcl/queries.ts`

**Interfaces:**
- Produces: `ILVL_TOLERANCE = 4`, `CANDIDATE_PAGES = 10`, and `Q_WORLD_RANKINGS` taking a `$page: Int!` variable.

- [ ] **Step 1: Add the two constants**

Append to `src/lib/wcl/constants.ts`:

```ts
/** Item levels of difference beyond which a reference stops being instructive. */
export const ILVL_TOLERANCE = 4;

/** Ranking pages fetched in parallel to build the candidate pool — 100 entries each. */
export const CANDIDATE_PAGES = 10;
```

- [ ] **Step 2: Add the page argument to the query**

Replace `Q_WORLD_RANKINGS` in `src/lib/wcl/queries.ts` with:

```ts
export const Q_WORLD_RANKINGS = `
  query WorldRankings(
    $encounterID: Int!, $difficulty: Int!,
    $specName: String!, $className: String!, $page: Int!
  ) {
    worldData {
      encounter(id: $encounterID) {
        characterRankings(
          specName: $specName, className: $className,
          metric: dps, difficulty: $difficulty, leaderboard: LogsOnly,
          page: $page
        )
      }
    }
  }
`;
```

- [ ] **Step 3: Verify the app still typechecks**

Run: `pnpm typecheck`
Expected: PASS. The two pipelines still call `Q_WORLD_RANKINGS` without `page`; GraphQL variables are untyped at the TypeScript level, so this compiles. Task 4 fixes the callers. Do not run `pnpm test` expecting the pipelines to work against the live API at this point — no test hits the network.

- [ ] **Step 4: Commit**

```bash
git add src/lib/wcl/constants.ts src/lib/wcl/queries.ts
git commit -m "feat(wcl): add ilvl tolerance, page budget and a paged rankings query"
```

---

## Task 2: The comparability scoring module

**Files:**
- Create: `src/lib/wcl/comparability.ts`
- Test: `src/lib/wcl/__tests__/comparability.test.ts`

**Interfaces:**
- Consumes: `ILVL_TOLERANCE`, `KILL_TIME_TOLERANCE`, `TOP_N` from `./constants`.
- Produces:

```ts
export interface ScoredCandidate<T> {
  candidate: T;
  /** Combined distance in tolerance units. 1 = at the edge of tolerance overall. */
  distance: number;
}

export type ComparabilityLevel = 'close' | 'approximate' | 'poor' | 'none';

export interface CandidateMetrics {
  bracketData?: number;
  duration: number;
}

export function scoreCandidate(
  candidate: CandidateMetrics,
  myIlvl: number,
  myDurationMs: number
): number;

export function selectClosest<T extends CandidateMetrics>(
  candidates: T[],
  myIlvl: number,
  myDurationMs: number,
  limit: number
): ScoredCandidate<T>[];

export function comparabilityLevel(scored: ScoredCandidate<unknown>[]): ComparabilityLevel;

export function medianOf(values: number[]): number | null;
```

`scoreCandidate` returns `Number.POSITIVE_INFINITY` when `bracketData` is missing, which sorts such a candidate after every scorable one without discarding it.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/wcl/__tests__/comparability.test.ts
import { describe, expect, it } from 'vitest';
import {
  comparabilityLevel,
  medianOf,
  scoreCandidate,
  selectClosest,
} from '../comparability';

const MY_ILVL = 284;
const MY_MS = 300000; // 5:00

describe('scoreCandidate', () => {
  it('is zero for a candidate identical to the player', () => {
    expect(scoreCandidate({ bracketData: 284, duration: 300000 }, MY_ILVL, MY_MS)).toBe(0);
  });

  it('is 1 when a single criterion sits exactly at its tolerance', () => {
    // 4 ilvl away, same kill time: 4/4 = 1 on one axis, 0 on the other
    expect(scoreCandidate({ bracketData: 288, duration: 300000 }, MY_ILVL, MY_MS)).toBe(1);
    // 20% slower, same ilvl: 0.2/0.2 = 1
    expect(scoreCandidate({ bracketData: 284, duration: 360000 }, MY_ILVL, MY_MS)).toBe(1);
  });

  it('treats a gap as equally bad in either direction', () => {
    const above = scoreCandidate({ bracketData: 288, duration: 300000 }, MY_ILVL, MY_MS);
    const below = scoreCandidate({ bracketData: 280, duration: 300000 }, MY_ILVL, MY_MS);
    expect(above).toBe(below);
  });

  it('combines the two axes so one good criterion does not excuse the other', () => {
    // at tolerance on both: sqrt(1 + 1)
    const both = scoreCandidate({ bracketData: 288, duration: 360000 }, MY_ILVL, MY_MS);
    expect(both).toBeCloseTo(Math.SQRT2, 5);
  });

  it('sorts a candidate with no ilvl after every scorable one', () => {
    expect(scoreCandidate({ duration: 300000 }, MY_ILVL, MY_MS)).toBe(Number.POSITIVE_INFINITY);
  });

  it('treats the kill-time gap as zero rather than dividing by zero', () => {
    expect(scoreCandidate({ bracketData: 284, duration: 5000 }, MY_ILVL, 0)).toBe(0);
  });
});

describe('selectClosest', () => {
  const candidates = [
    { name: 'far-strong', bracketData: 296, duration: 200000 },
    { name: 'near', bracketData: 285, duration: 310000 },
    { name: 'mid', bracketData: 290, duration: 330000 },
    { name: 'no-ilvl', duration: 300000 },
  ];

  it('returns the closest candidates, not the fastest ones', () => {
    const picked = selectClosest(candidates, MY_ILVL, MY_MS, 2);
    expect(picked.map((p) => p.candidate.name)).toEqual(['near', 'mid']);
  });

  it('keeps an unscorable candidate last rather than dropping it', () => {
    const picked = selectClosest(candidates, MY_ILVL, MY_MS, 4);
    expect(picked[3].candidate.name).toBe('no-ilvl');
    expect(picked[3].distance).toBe(Number.POSITIVE_INFINITY);
  });

  it('returns an empty list for an empty pool', () => {
    expect(selectClosest([], MY_ILVL, MY_MS, 3)).toEqual([]);
  });

  it('attaches the distance it sorted on', () => {
    const [first] = selectClosest(candidates, MY_ILVL, MY_MS, 1);
    expect(first.distance).toBeCloseTo(
      scoreCandidate({ bracketData: 285, duration: 310000 }, MY_ILVL, MY_MS),
      5
    );
  });
});

describe('comparabilityLevel', () => {
  const at = (distance: number) => ({ candidate: null, distance });

  it('is none for an empty selection', () => {
    expect(comparabilityLevel([])).toBe('none');
  });

  it('is close at a median distance of exactly 1', () => {
    expect(comparabilityLevel([at(0.5), at(1), at(1)])).toBe('close');
  });

  it('is approximate at a median distance of exactly 2', () => {
    expect(comparabilityLevel([at(1.5), at(2), at(2)])).toBe('approximate');
  });

  it('is poor beyond 2', () => {
    expect(comparabilityLevel([at(3), at(4), at(5)])).toBe('poor');
  });

  it('is poor when every candidate is unscorable', () => {
    expect(comparabilityLevel([at(Number.POSITIVE_INFINITY)])).toBe('poor');
  });
});

describe('medianOf', () => {
  it('averages the two middle values for an even count', () => {
    expect(medianOf([1, 2, 3, 4])).toBe(2.5);
  });

  it('returns the middle value for an odd count', () => {
    expect(medianOf([3, 1, 2])).toBe(2);
  });

  it('returns null for an empty list', () => {
    expect(medianOf([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/wcl/__tests__/comparability.test.ts`
Expected: FAIL — `Failed to resolve import "../comparability"`.

- [ ] **Step 3: Implement the module**

```ts
// src/lib/wcl/comparability.ts
import { ILVL_TOLERANCE, KILL_TIME_TOLERANCE } from './constants';

export interface CandidateMetrics {
  /** The candidate's item level, as WCL reports it on a ranking entry. */
  bracketData?: number;
  duration: number;
}

export interface ScoredCandidate<T> {
  candidate: T;
  /** Combined distance in tolerance units. 1 = at the edge of tolerance overall. */
  distance: number;
}

export type ComparabilityLevel = 'close' | 'approximate' | 'poor' | 'none';

/**
 * How far a candidate sits from the player, combining item level and kill time.
 *
 * Each gap is divided by its own tolerance so the two become comparable, then
 * combined euclidean-style: being excellent on one axis does not fully excuse a
 * gap on the other.
 */
export function scoreCandidate(
  candidate: CandidateMetrics,
  myIlvl: number,
  myDurationMs: number
): number {
  if (candidate.bracketData === undefined || candidate.bracketData === null) {
    return Number.POSITIVE_INFINITY;
  }

  const ilvlGap = Math.abs(candidate.bracketData - myIlvl) / ILVL_TOLERANCE;

  const killTimeGap =
    myDurationMs > 0
      ? Math.abs(candidate.duration - myDurationMs) / myDurationMs / KILL_TIME_TOLERANCE
      : 0;

  return Math.sqrt(ilvlGap ** 2 + killTimeGap ** 2);
}

/** The `limit` candidates closest to the player, each carrying the distance it sorted on. */
export function selectClosest<T extends CandidateMetrics>(
  candidates: T[],
  myIlvl: number,
  myDurationMs: number,
  limit: number
): ScoredCandidate<T>[] {
  return candidates
    .map((candidate) => ({
      candidate,
      distance: scoreCandidate(candidate, myIlvl, myDurationMs),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

export function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** How legitimate the comparison is, from the median distance of the chosen references. */
export function comparabilityLevel(scored: ScoredCandidate<unknown>[]): ComparabilityLevel {
  if (scored.length === 0) return 'none';

  const median = medianOf(scored.map((s) => s.distance));
  if (median === null) return 'none';
  if (median <= 1) return 'close';
  if (median <= 2) return 'approximate';
  return 'poor';
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/wcl/__tests__/comparability.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/wcl/comparability.ts src/lib/wcl/__tests__/comparability.test.ts
git commit -m "feat(wcl): score candidates by distance from the player"
```

---

## Task 3: The candidate pool

**Files:**
- Modify: `src/lib/wcl/references.ts`
- Test: `src/lib/wcl/__tests__/references.test.ts` (existing file — add to it, do not rewrite it)

**Interfaces:**
- Consumes: `selectClosest` from `./comparability`; `CANDIDATE_PAGES`, `TOP_N` from `./constants`; `gql` from `./client`; `Q_WORLD_RANKINGS` from `./queries`.
- Produces:

```ts
export interface WorldRanking {
  name: string;
  amount: number;
  duration: number;
  bracketData?: number;
  report: { code: string; fightID: number };
}

export interface CandidatePool {
  candidates: WorldRanking[];
  pagesFetched: number;
}

export async function fetchCandidatePool(
  token: string,
  args: { encounterId: number; difficulty: number; specName: string; className: string }
): Promise<CandidatePool>;

export function selectReferencePool(
  all: WorldRanking[],
  fightMs: number,
  myIlvl: number
): WorldRanking[];
```

`selectReferencePool` keeps its name and its place as the selection entry point, but its signature gains `myIlvl` and its body now delegates to the scoring module. Its old kill-time-window-then-fallback behaviour is gone.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/wcl/__tests__/references.test.ts`. Keep every existing test in that file untouched — the three `selectReferencePool` cases that assert the old window-and-fallback behaviour will now fail, and **that is intended**: they encode the defect this plan removes. Delete exactly those three (`keeps only rankings inside the kill time window`, `includes the exact window bounds`, `falls back to the raw world top when nothing lands in the window`) and note the deletion in your report. Leave `caps the pool at TOP_N`, `returns nothing when there are no rankings at all`, and every `fetchReferencePlayers` test in place, adapting only the added `myIlvl` argument where the signature requires it.

```ts
describe('fetchCandidatePool', () => {
  beforeEach(() => vi.restoreAllMocks());

  function page(n: number, entries: number) {
    return {
      worldData: {
        encounter: {
          characterRankings: {
            rankings: Array.from({ length: entries }, (_, i) => ({
              name: `p${n}-${i}`,
              amount: 100,
              duration: 300000,
              bracketData: 290,
              report: { code: `c${n}-${i}`, fightID: 1 },
            })),
          },
        },
      },
    };
  }

  it('fetches every page and concatenates them', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      return {
        ok: true,
        json: async () => ({ data: page(body.variables.page, 2) }),
      } as Response;
    });

    const pool = await fetchCandidatePool('token', {
      encounterId: 1,
      difficulty: 5,
      specName: 'Feral',
      className: 'Druid',
    });

    expect(pool.pagesFetched).toBe(CANDIDATE_PAGES);
    expect(pool.candidates).toHaveLength(CANDIDATE_PAGES * 2);
  });

  it('drops duplicates that appear on more than one page', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: page(0, 2) }),
    } as Response);

    const pool = await fetchCandidatePool('token', {
      encounterId: 1,
      difficulty: 5,
      specName: 'Feral',
      className: 'Druid',
    });

    // Every page returns the same two entries, so only two survive.
    expect(pool.candidates).toHaveLength(2);
  });

  it('keeps the pages that succeeded when one fails', async () => {
    let call = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      call += 1;
      if (call === 3) return { ok: false, status: 500 } as Response;
      return { ok: true, json: async () => ({ data: page(call, 1) }) } as Response;
    });

    const pool = await fetchCandidatePool('token', {
      encounterId: 1,
      difficulty: 5,
      specName: 'Feral',
      className: 'Druid',
    });

    expect(pool.pagesFetched).toBe(CANDIDATE_PAGES - 1);
    expect(pool.candidates).toHaveLength(CANDIDATE_PAGES - 1);
  });
});

describe('selectReferencePool', () => {
  const MY_ILVL = 284;
  const MY_MS = 300000;

  function ranking(name: string, bracketData: number, duration: number): WorldRanking {
    return { name, amount: 200000, duration, bracketData, report: { code: name, fightID: 1 } };
  }

  it('prefers the closest candidate over the highest-dps one', () => {
    const all = [
      { ...ranking('strong', 296, 200000), amount: 400000 },
      ranking('close', 285, 305000),
    ];

    expect(selectReferencePool(all, MY_MS, MY_ILVL).map((r) => r.name)).toEqual([
      'close',
      'strong',
    ]);
  });

  it('caps the result at TOP_N', () => {
    const all = Array.from({ length: TOP_N + 5 }, (_, i) => ranking(`r${i}`, 284, 300000));

    expect(selectReferencePool(all, MY_MS, MY_ILVL)).toHaveLength(TOP_N);
  });

  it('returns nothing when there are no rankings at all', () => {
    expect(selectReferencePool([], MY_MS, MY_ILVL)).toEqual([]);
  });

  it('still returns references when none is within tolerance', () => {
    const all = [ranking('far', 320, 120000), ranking('further', 340, 100000)];

    expect(selectReferencePool(all, MY_MS, MY_ILVL).map((r) => r.name)).toEqual([
      'far',
      'further',
    ]);
  });
});
```

Add the imports the new tests need at the top of the file: `CANDIDATE_PAGES` and `TOP_N` from `../constants`, and `fetchCandidatePool` alongside the existing imports from `../references`.

- [ ] **Step 2: Run and watch the new tests fail**

Run: `npx vitest run src/lib/wcl/__tests__/references.test.ts`
Expected: FAIL — `fetchCandidatePool` is not exported, and `selectReferencePool` takes two arguments.

- [ ] **Step 3: Implement**

In `src/lib/wcl/references.ts`, add `bracketData?: number;` to `WorldRanking`, then replace the `selectReferencePool` function and its comment with:

```ts
export interface CandidatePool {
  candidates: WorldRanking[];
  pagesFetched: number;
}

interface RankingsResponse {
  worldData: { encounter: { characterRankings: { rankings?: WorldRanking[] } } };
}

/**
 * Builds the candidate pool by fetching CANDIDATE_PAGES pages in parallel.
 *
 * One page is 100 entries and the world rankings are ordered by damage, so the
 * players comparable to an under-geared character sit several pages deep — a
 * single page contains only the best-equipped. A page that fails is skipped
 * rather than failing the analysis, and pagesFetched reports what was obtained.
 */
export async function fetchCandidatePool(
  token: string,
  args: { encounterId: number; difficulty: number; specName: string; className: string }
): Promise<CandidatePool> {
  const pages = await Promise.all(
    Array.from({ length: CANDIDATE_PAGES }, (_, i) =>
      gql<RankingsResponse>(token, Q_WORLD_RANKINGS, {
        encounterID: args.encounterId,
        difficulty: args.difficulty,
        specName: args.specName,
        className: args.className,
        page: i + 1,
      })
        .then((data) => data.worldData.encounter.characterRankings.rankings ?? [])
        .catch(() => null)
    )
  );

  const seen = new Set<string>();
  const candidates: WorldRanking[] = [];
  let pagesFetched = 0;

  for (const page of pages) {
    if (page === null) continue;
    pagesFetched += 1;
    for (const entry of page) {
      const key = `${entry.report.code}:${entry.report.fightID}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(entry);
    }
  }

  return { candidates, pagesFetched };
}

/**
 * Picks the references a character is compared against: the candidates closest
 * to them in item level and kill time, not the ones with the highest damage.
 */
export function selectReferencePool(
  all: WorldRanking[],
  fightMs: number,
  myIlvl: number
): WorldRanking[] {
  return selectClosest(all, myIlvl, fightMs, TOP_N).map((s) => s.candidate);
}
```

Update the imports at the top of the file:

```ts
import type { TopPlayer } from '@/types';
import { findCombatantBySpecId } from './combatant';
import { selectClosest } from './comparability';
import { gql } from './client';
import { CANDIDATE_PAGES, TOP_N } from './constants';
import { fetchFightData } from './fight-data';
import { fmtMs } from './parsers';
```

`KILL_TIME_TOLERANCE` is no longer imported here — it moved to `comparability.ts`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/wcl/__tests__/references.test.ts`
Expected: PASS. The three deleted tests are gone; the rest pass with the added argument.

- [ ] **Step 5: Commit**

```bash
git add src/lib/wcl/references.ts src/lib/wcl/__tests__/references.test.ts
git commit -m "feat(wcl): build a paged candidate pool and select by proximity"
```

---

## Task 4: Carry comparability through both pipelines

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/wcl/pipeline.ts`
- Modify: `src/lib/wcl/report-pipeline.ts`

**Interfaces:**
- Consumes: `fetchCandidatePool`, `selectReferencePool` (Task 3); `comparabilityLevel`, `medianOf`, `selectClosest` (Task 2).
- Produces: `BossResult.comparability`, shape below, non-optional.

- [ ] **Step 1: Add the type**

In `src/types/index.ts`, above `BossResult`. **`ComparabilityLevel` is defined once, in
`comparability.ts` (Task 2), and re-exported here** — do not declare a second copy, or the two
will drift:

```ts
export type { ComparabilityLevel } from '@/lib/wcl/comparability';
import type { ComparabilityLevel } from '@/lib/wcl/comparability';

export interface Comparability {
  level: ComparabilityLevel;
  /** Median of the chosen references; null when there are none. */
  referenceIlvl: number | null;
  myIlvl: number;
  referenceKillTimeMs: number | null;
  myKillTimeMs: number;
  candidatesConsidered: number;
  pagesFetched: number;
}
```

Add `comparability: Comparability;` to `BossResult`, after `topPlayers`.

- [ ] **Step 2: Rewire `pipeline.ts`**

In `src/lib/wcl/pipeline.ts`, replace the `worldDataPromise` declaration with a pool promise, since the pool now needs the spec info that is already resolved above it:

```ts
  const poolPromise = fetchCandidatePool(token, {
    encounterId,
    difficulty,
    specName,
    className,
  });
```

Then replace the block that awaits the world data and builds `topPlayers` with:

```ts
  const pool = await poolPromise;
  const references = selectReferencePool(pool.candidates, bestKillMs, stats.avgIlvl);
  const topPlayers = await fetchReferencePlayers(token, references, charEvent.specID);

  const scored = selectClosest(references, stats.avgIlvl, bestKillMs, references.length);
  const comparability: Comparability = {
    level: comparabilityLevel(scored),
    referenceIlvl: medianOf(
      references.map((r) => r.bracketData).filter((v): v is number => v !== undefined)
    ),
    myIlvl: stats.avgIlvl,
    referenceKillTimeMs: medianOf(references.map((r) => r.duration)),
    myKillTimeMs: bestKillMs,
    candidatesConsidered: pool.candidates.length,
    pagesFetched: pool.pagesFetched,
  };
```

Add `comparability,` to the returned object, and update the imports: drop `Q_WORLD_RANKINGS`, add `fetchCandidatePool` and `selectReferencePool` from `./references`, `comparabilityLevel`, `medianOf` and `selectClosest` from `./comparability`, and the `Comparability` type from `@/types`.

`stats` is the value `fetchFightData` returns, already destructured in this function — the player's ilvl is `stats.avgIlvl`, available before the selection.

- [ ] **Step 3: Rewire `report-pipeline.ts` the same way**

Apply the identical change in `src/lib/wcl/report-pipeline.ts`, using `fightMs` where `pipeline.ts` uses `bestKillMs`:

```ts
  const pool = await poolPromise;
  const references = selectReferencePool(pool.candidates, fightMs, stats.avgIlvl);
  const topPlayers = await fetchReferencePlayers(token, references, charEvent.specID);

  const scored = selectClosest(references, stats.avgIlvl, fightMs, references.length);
  const comparability: Comparability = {
    level: comparabilityLevel(scored),
    referenceIlvl: medianOf(
      references.map((r) => r.bracketData).filter((v): v is number => v !== undefined)
    ),
    myIlvl: stats.avgIlvl,
    referenceKillTimeMs: medianOf(references.map((r) => r.duration)),
    myKillTimeMs: fightMs,
    candidatesConsidered: pool.candidates.length,
    pagesFetched: pool.pagesFetched,
  };
```

Keep the pool promise starting before `fetchFightData` and awaited after it, so the two round trips still overlap.

- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm test && pnpm lint && pnpm format:check`
Expected: all pass. Typecheck is what proves every construction site of `BossResult` now supplies `comparability` — including the fixtures in `src/app/api/analyze/[encounterId]/__tests__/route.test.ts` and `src/hooks/__tests__/useAnalysis.test.ts` if they build one. If a fixture needs the new field, add it there; that is a fixture completing a required type, not a test being weakened.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/lib/wcl/pipeline.ts src/lib/wcl/report-pipeline.ts
git commit -m "feat(wcl): carry a comparability verdict on every boss result"
```

---

## Task 5: The comparability banner

**Files:**
- Create: `src/components/results/ComparabilityBanner.tsx`
- Test: `src/components/results/__tests__/ComparabilityBanner.test.tsx`

**Interfaces:**
- Consumes: `Comparability` from `@/types`; `Card` from `@/components/ui/Card`.
- Produces: `<ComparabilityBanner comparability={Comparability} />`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/results/__tests__/ComparabilityBanner.test.tsx
import type { Comparability } from '@/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ComparabilityBanner } from '../ComparabilityBanner';

function comparability(over: Partial<Comparability> = {}): Comparability {
  return {
    level: 'close',
    referenceIlvl: 285,
    myIlvl: 284,
    referenceKillTimeMs: 305000,
    myKillTimeMs: 300000,
    candidatesConsidered: 942,
    pagesFetched: 10,
    ...over,
  };
}

describe('comparabilityBanner', () => {
  it('states a close comparison without red', () => {
    const { container } = render(<ComparabilityBanner comparability={comparability()} />);

    expect(screen.getByText(/Comparable/i)).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('text-danger');
  });

  it('signs the item-level gap upward', () => {
    render(
      <ComparabilityBanner
        comparability={comparability({ level: 'poor', referenceIlvl: 292, myIlvl: 284 })}
      />
    );

    expect(screen.getByText(/\+8/)).toBeInTheDocument();
  });

  it('signs the item-level gap downward', () => {
    render(
      <ComparabilityBanner
        comparability={comparability({ referenceIlvl: 280, myIlvl: 284 })}
      />
    );

    expect(screen.getByText(/−4/)).toBeInTheDocument();
  });

  it('marks a poor comparison in red', () => {
    const { container } = render(
      <ComparabilityBanner comparability={comparability({ level: 'poor' })} />
    );

    expect(container.innerHTML).toContain('text-danger');
  });

  it('says plainly when there is nothing to compare against', () => {
    render(
      <ComparabilityBanner
        comparability={comparability({
          level: 'none',
          referenceIlvl: null,
          referenceKillTimeMs: null,
        })}
      />
    );

    expect(screen.getByText(/No comparable logs/i)).toBeInTheDocument();
  });

  it('reports how wide a net was cast', () => {
    render(<ComparabilityBanner comparability={comparability()} />);

    expect(screen.getByText(/942/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/components/results/__tests__/ComparabilityBanner.test.tsx`
Expected: FAIL — `Failed to resolve import "../ComparabilityBanner"`.

- [ ] **Step 3: Implement**

```tsx
// src/components/results/ComparabilityBanner.tsx
import type { Comparability, ComparabilityLevel } from '@/types';
import { Card } from '@/components/ui/Card';

interface ComparabilityBannerProps {
  comparability: Comparability;
}

const LEVEL_TONE: Record<ComparabilityLevel, string> = {
  close: 'text-positive',
  approximate: 'text-warning',
  poor: 'text-danger',
  none: 'text-muted',
};

const LEVEL_LABEL: Record<ComparabilityLevel, string> = {
  close: 'Comparable',
  approximate: 'Roughly comparable',
  poor: 'Not comparable',
  none: 'No comparable logs',
};

/** U+2212 minus, not a hyphen — it aligns with digits in a monospace face. */
function signed(value: number): string {
  return value < 0 ? `−${Math.abs(value)}` : `+${value}`;
}

function round1(value: number): number {
  return Math.sign(value) * (Math.round(Math.abs(value) * 10) / 10);
}

export function ComparabilityBanner({ comparability }: ComparabilityBannerProps) {
  const { level, referenceIlvl, myIlvl, referenceKillTimeMs, myKillTimeMs } = comparability;
  const tone = LEVEL_TONE[level];

  const ilvlGap = referenceIlvl === null ? null : round1(referenceIlvl - myIlvl);
  const killTimeGapPct =
    referenceKillTimeMs === null || myKillTimeMs === 0
      ? null
      : round1(((referenceKillTimeMs - myKillTimeMs) / myKillTimeMs) * 100);

  return (
    <Card header="Comparison basis">
      <p className={`font-sans text-sm ${tone}`}>{LEVEL_LABEL[level]}</p>

      {ilvlGap !== null && killTimeGapPct !== null && (
        <p className="text-muted mt-2 font-sans text-xs">
          References sit at <span className="font-mono">{referenceIlvl}</span> item level,{' '}
          <span className="font-mono">{signed(ilvlGap)}</span> against your{' '}
          <span className="font-mono">{myIlvl}</span>, and their kills run{' '}
          <span className="font-mono">{signed(killTimeGapPct)}%</span> against yours.
        </p>
      )}

      <p className="text-dim mt-2 font-sans text-2xs">
        Closest of <span className="font-mono">{comparability.candidatesConsidered}</span>{' '}
        candidates over <span className="font-mono">{comparability.pagesFetched}</span> ranking
        pages.
      </p>
    </Card>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/results/__tests__/ComparabilityBanner.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/results/ComparabilityBanner.tsx src/components/results/__tests__/ComparabilityBanner.test.tsx
git commit -m "feat(results): state the comparison's legitimacy on screen"
```

---

## Task 6: Show the banner

**Files:**
- Modify: `src/components/results/ComparisonTab.tsx`

**Interfaces:**
- Consumes: `ComparabilityBanner` (Task 5); `BossResult.comparability` (Task 4).

- [ ] **Step 1: Render it above the comparison**

Add the import alongside the other result components:

```tsx
import { ComparabilityBanner } from './ComparabilityBanner';
```

Insert the banner between `DpsBanner` and the `Stats vs top players` block:

```tsx
      <div className="mt-6">
        <ComparabilityBanner comparability={result.comparability} />
      </div>
```

Change nothing else in the file. The tab's props do not change.

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm test && pnpm lint && pnpm format:check`
Expected: all pass, existing tests unmodified.

- [ ] **Step 3: Commit**

```bash
git add src/components/results/ComparisonTab.tsx
git commit -m "feat(results): show the comparison basis above the comparison"
```

---

## Final verification

- [ ] **Step 1: Full gate**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
Expected: all pass.

- [ ] **Step 2: Measure the latency cost**

The rankings requests per boss go from 1 to `CANDIDATE_PAGES`. With the dev server running, time the same boss before and after:

```bash
curl -s -X POST "http://localhost:3000/api/analyze/3177" \
  -H "Content-Type: application/json" \
  -d '{"characterName":"Jumbaa","serverSlug":"ysondre","region":"EU","difficulty":5,"encounterName":"Vorasius","specId":103}' \
  -o /dev/null -w "%{time_total}s\n"
```

The measurement taken before this plan, on the same boss, was **5.3 s**. If the new figure exceeds **10.6 s**, stop and report it rather than continuing: `CANDIDATE_PAGES` needs revisiting before this ships.

- [ ] **Step 3: Confirm the references actually improved**

Run the same request and inspect the result:

```bash
curl -s -X POST "http://localhost:3000/api/analyze/3177" \
  -H "Content-Type: application/json" \
  -d '{"characterName":"Jumbaa","serverSlug":"ysondre","region":"EU","difficulty":5,"encounterName":"Vorasius","specId":103}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);console.log('comparability:',JSON.stringify(r.comparability));r.topPlayers.forEach(p=>console.log(' -',p.stats.name,'ilvl',p.stats.avgIlvl,'dps',p.stats.dps,'kill',p.stats.killTime));})"
```

Expected: the references' item levels are closer to **284** than the **292,1 / 292,7 / 292,7** measured before this plan, and `comparability.level` is consistent with the remaining gap. Record both figures in your report.

- [ ] **Step 4: Confirm both paths agree**

Run the report path on the same fight and check its `comparability` block matches the character path's:

```bash
curl -s -X POST "http://localhost:3000/api/report/analyze" \
  -H "Content-Type: application/json" \
  -d '{"code":"gjQ47FLB3Vf9XZDp","actorId":63,"actorName":"Jumbaa","actorClass":"Druid","specId":103,"difficulty":5,"encounters":[{"id":3177,"name":"Vorasius","fightId":17,"fightMs":326876}]}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const b=JSON.parse(s).bosses[0];console.log('comparability:',JSON.stringify(b.comparability));})"
```

Expected: the same references and the same level as step 3. The two paths share `references.ts`, so a divergence means one of them wires the selection differently.

- [ ] **Step 5: Check the banner at three widths**

With the stubbed dev server on port 3100 (`PORT=3100 ENABLE_DEV_SESSION=1 pnpm dev`), reach the Comparison tab through the report path and confirm at **360**, **768** and **1280** that the banner reads correctly, does not overflow, and shows red only when the level is `poor`.

- [ ] **Step 6: Update the product context**

`PRODUCT_CONTEXT.md` §7 lists C2 — the silent fallback — and C4 — `avgIlvl` unused for selection — as open defects, and §8 lists tasks 2 and 4 accordingly. Both are now closed. Amend those entries to say so, and record the measured ilvl of the references before and after.

```bash
git add PRODUCT_CONTEXT.md
git commit -m "docs: close the silent-fallback and unused-ilvl findings"
```
