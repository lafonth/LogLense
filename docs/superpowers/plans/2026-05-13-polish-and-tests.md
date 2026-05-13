# Polish & Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete ComparisonTab visual polish (stat delta badges, rotation status dots), wire ProgressSteps into the fetch loading flow, fix zonesError to use ErrorBanner, add hook integration tests for useAnalysis and useAIReport, and replace the stale Python-only README with a Next.js setup guide.

**Architecture:** Four additive patches to existing UI components (StatsTable, RotationTable, CharacterForm, ResultsDashboard), two new hook test files using @testing-library/react with vi.stubGlobal for fetch mocking (requires jsdom environment via vitest workspace file), and a full README rewrite.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest 3, @testing-library/react, happy-dom

---

## File Map

| File | Change |
|---|---|
| `src/components/results/StatsTable.tsx` | Add delta badge inline with "You" column values |
| `src/components/results/RotationTable.tsx` | Add colored status dot in "You /min" and "You" uptime cells |
| `src/components/forms/CharacterForm.tsx` | Replace inline crimson div with `<ErrorBanner>` |
| `src/components/results/ResultsDashboard.tsx` | Add `<ProgressSteps>` banner above tabs while fetching |
| `vitest.config.ts` | Add workspace split: node env for API tests, jsdom for hook tests |
| `src/hooks/__tests__/useAnalysis.test.ts` | New — integration tests for useAnalysis hook |
| `src/hooks/__tests__/useAIReport.test.ts` | New — integration tests for useAIReport hook |
| `README.md` | Full rewrite for Next.js app |

---

### Task 1: StatsTable — delta badge next to "You" values

**Files:**
- Modify: `src/components/results/StatsTable.tsx`

- [ ] **Step 1: Replace src/components/results/StatsTable.tsx**

```tsx
import type { CharacterStats, TopPlayer } from '@/types';

interface StatsTableProps {
  character: CharacterStats;
  topPlayers: TopPlayer[];
}

const STAT_ROWS: { label: string; key: keyof CharacterStats; fmt: (v: unknown) => string }[] = [
  { label: 'Avg ilvl', key: 'avgIlvl', fmt: (v) => (v as number).toFixed(1) },
  { label: 'Agility', key: 'agility', fmt: (v) => (v as number).toLocaleString('en-US') },
  { label: 'Crit', key: 'crit', fmt: (v) => (v as number).toLocaleString('en-US') },
  { label: 'Haste', key: 'haste', fmt: (v) => (v as number).toLocaleString('en-US') },
  { label: 'Mastery', key: 'mastery', fmt: (v) => (v as number).toLocaleString('en-US') },
  { label: 'Versatility', key: 'vers', fmt: (v) => (v as number).toLocaleString('en-US') },
];

const cellStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.82rem',
  borderBottom: '1px solid var(--border)',
  textAlign: 'right',
};

const headerCellStyle: React.CSSProperties = {
  ...cellStyle,
  color: 'var(--gold-dim)',
  fontSize: '0.72rem',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
};

function avgTopStat(topPlayers: TopPlayer[], key: keyof CharacterStats): number {
  if (topPlayers.length === 0) return 0;
  const nums = topPlayers.map((p) => p.stats[key] as number);
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function DeltaBadge({ delta }: { delta: number }) {
  const pos = delta >= 0;
  return (
    <span
      style={{
        color: pos ? 'var(--gold-dim)' : 'var(--crimson)',
        fontSize: '0.7rem',
        marginLeft: '8px',
        opacity: 0.85,
      }}
    >
      {pos ? '+' : '−'}
      {Math.abs(Math.round(delta)).toLocaleString('en-US')}
    </span>
  );
}

export function StatsTable({ character, topPlayers }: StatsTableProps) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ ...headerCellStyle, textAlign: 'left' }}>Stat</th>
          <th style={headerCellStyle}>You</th>
          {topPlayers.map((p, i) => (
            <th key={p.stats.name} style={headerCellStyle}>
              P{i + 1}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {STAT_ROWS.map(({ label, key, fmt }) => {
          const delta =
            topPlayers.length > 0
              ? (character[key] as number) - avgTopStat(topPlayers, key)
              : null;
          return (
            <tr key={label}>
              <td style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-dim)' }}>
                {label}
              </td>
              <td style={{ ...cellStyle, color: 'var(--text)' }}>
                {fmt(character[key])}
                {delta !== null && <DeltaBadge delta={delta} />}
              </td>
              {topPlayers.map((p) => (
                <td key={p.stats.name} style={{ ...cellStyle, color: 'var(--text-dim)' }}>
                  {fmt(p.stats[key])}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Run type-check**

```powershell
pnpm tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```powershell
git add src/components/results/StatsTable.tsx
git commit -m "feat: add delta badge to StatsTable You column"
```

---

### Task 2: RotationTable — status dot in "You" cells

**Files:**
- Modify: `src/components/results/RotationTable.tsx`

The dot logic: compare user's `perMin` (or uptime %) against the average of top players for that ability.
- ratio ≥ 0.90 → gold dot (on-par or better)
- ratio ≥ 0.70 → amber dot (slightly behind)
- ratio < 0.70 OR tops use it but user doesn't → crimson dot (missing/far behind)
- tops don't use it → no dot

- [ ] **Step 1: Replace src/components/results/RotationTable.tsx**

```tsx
import type { CastEntry, RotationSummary, TopPlayer } from '@/types';

interface RotationTableProps {
  character: RotationSummary;
  topPlayers: TopPlayer[];
}

const cellStyle: React.CSSProperties = {
  padding: '5px 10px',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.8rem',
  borderBottom: '1px solid rgba(42,37,53,0.5)',
  textAlign: 'right',
};

const headerCellStyle: React.CSSProperties = {
  padding: '5px 10px',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.72rem',
  color: 'var(--gold-dim)',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  textAlign: 'right',
  borderBottom: '1px solid var(--border)',
};

function dotColor(ratio: number | null): string | null {
  if (ratio === null) return null;
  if (ratio >= 0.9) return 'var(--gold-dim)';
  if (ratio >= 0.7) return '#b87333';
  return 'var(--crimson)';
}

function castRatio(mine: CastEntry | undefined, topPlayers: TopPlayer[], ability: string): number | null {
  const topVals = topPlayers.map((p) => p.rotation.casts[ability]?.perMin ?? 0);
  const topAvg = topVals.reduce((a, b) => a + b, 0) / topVals.length;
  if (topAvg === 0) return null; // tops don't use it
  if (!mine) return 0; // user doesn't use it but tops do
  return mine.perMin / topAvg;
}

function uptimeRatio(userPct: number, topPlayers: TopPlayer[], ability: string): number | null {
  const topVals = topPlayers.map((p) => p.rotation.buffs[ability] ?? 0);
  const topAvg = topVals.reduce((a, b) => a + b, 0) / topVals.length;
  if (topAvg === 0) return null;
  return userPct / topAvg;
}

function StatusDot({ ratio }: { ratio: number | null }) {
  const color = dotColor(ratio);
  if (!color) return null;
  return (
    <span
      style={{
        display: 'inline-block',
        width: '7px',
        height: '7px',
        borderRadius: '50%',
        background: color,
        marginRight: '6px',
        verticalAlign: 'middle',
        flexShrink: 0,
      }}
    />
  );
}

export function RotationTable({ character, topPlayers }: RotationTableProps) {
  const allAbilities = [
    ...new Set([
      ...Object.keys(character.casts),
      ...topPlayers.flatMap((p) => Object.keys(p.rotation.casts)),
    ]),
  ].sort((a, b) => (character.casts[b]?.casts ?? 0) - (character.casts[a]?.casts ?? 0));

  const activeBufEntries = Object.entries(character.buffs).filter(
    ([name, pct]) => character.casts[name] !== undefined && pct > 0
  );

  return (
    <div style={{ marginTop: '16px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...headerCellStyle, textAlign: 'left' }}>Ability</th>
            <th style={headerCellStyle}>You /min</th>
            {topPlayers.map((p, i) => (
              <th key={p.stats.name} style={headerCellStyle}>
                P{i + 1} /min
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allAbilities.map((ability) => {
            const mine = character.casts[ability];
            const ratio = castRatio(mine, topPlayers, ability);
            return (
              <tr key={ability}>
                <td style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-dim)' }}>
                  {ability}
                </td>
                <td style={{ ...cellStyle, color: 'var(--text)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <StatusDot ratio={ratio} />
                    {mine ? mine.perMin.toFixed(2) : '—'}
                  </span>
                </td>
                {topPlayers.map((p) => {
                  const entry = p.rotation.casts[ability];
                  return (
                    <td key={p.stats.name} style={{ ...cellStyle, color: 'var(--text-dim)' }}>
                      {entry ? entry.perMin.toFixed(2) : '—'}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {activeBufEntries.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px' }}>
          <thead>
            <tr>
              <th style={{ ...headerCellStyle, textAlign: 'left' }}>Uptime</th>
              <th style={headerCellStyle}>You</th>
              {topPlayers.map((p, i) => (
                <th key={p.stats.name} style={headerCellStyle}>
                  P{i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeBufEntries.map(([name, pct]) => {
              const ratio = uptimeRatio(pct, topPlayers, name);
              return (
                <tr key={name}>
                  <td style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-dim)' }}>
                    {name}
                  </td>
                  <td style={{ ...cellStyle, color: 'var(--text)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      <StatusDot ratio={ratio} />
                      {pct}%
                    </span>
                  </td>
                  {topPlayers.map((p) => (
                    <td key={p.stats.name} style={{ ...cellStyle, color: 'var(--text-dim)' }}>
                      {p.rotation.buffs[name] ?? 0}%
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run type-check**

```powershell
pnpm tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```powershell
git add src/components/results/RotationTable.tsx
git commit -m "feat: add status dots to RotationTable You column"
```

---

### Task 3: CharacterForm — replace inline zonesError div with ErrorBanner

**Files:**
- Modify: `src/components/forms/CharacterForm.tsx`

The existing render in the Raid field block has an inline crimson `<div>` for `zonesError`. Replace it with `<ErrorBanner>` for consistent styling.

- [ ] **Step 1: Add ErrorBanner import to CharacterForm.tsx**

In `src/components/forms/CharacterForm.tsx`, add this import after the existing imports:

```tsx
import { ErrorBanner } from '@/components/ui/ErrorBanner';
```

- [ ] **Step 2: Replace inline zonesError div**

Find this block in `CharacterForm.tsx` (the `zonesError` branch inside the Raid field):

```tsx
          ) : zonesError ? (
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.82rem',
                color: 'var(--crimson)',
                padding: '8px 0',
              }}
            >
              {zonesError}
            </div>
          ) : (
```

Replace it with:

```tsx
          ) : zonesError ? (
            <ErrorBanner message={zonesError} />
          ) : (
```

- [ ] **Step 3: Run type-check**

```powershell
pnpm tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```powershell
git add src/components/forms/CharacterForm.tsx
git commit -m "fix: use ErrorBanner for zones fetch error in CharacterForm"
```

---

### Task 4: ResultsDashboard — ProgressSteps fetch banner

Show a per-boss progress list above the tab bar while any boss fetch is in-flight. Maps each `BossState` to a `StepStatus`: `idle`/`loading` → `loading`, `success` → `done`, `error` → `error`.

**Files:**
- Modify: `src/components/results/ResultsDashboard.tsx`

- [ ] **Step 1: Add ProgressSteps import to ResultsDashboard.tsx**

Add this import after the existing imports in `src/components/results/ResultsDashboard.tsx`:

```tsx
import { ProgressSteps } from '@/components/ui/ProgressSteps';
import type { StepStatus } from '@/components/ui/ProgressSteps';
```

- [ ] **Step 2: Add the progress banner above the tab bar**

In `ResultsDashboard`, find this block (the tab bar `<div>`):

```tsx
      <div style={{ borderBottom: '1px solid var(--border)', marginBottom: '24px' }}>
```

Insert immediately before it:

```tsx
      {bossStates.some((s) => s.status === 'loading' || s.status === 'idle') && (
        <div
          style={{
            marginBottom: '20px',
            padding: '14px 16px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              color: 'var(--gold-dim)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '10px',
            }}
          >
            Fetching bosses…
          </div>
          <ProgressSteps
            steps={input.encounters.map((enc, i) => {
              const s = bossStates[i];
              const status: StepStatus =
                s?.status === 'success'
                  ? 'done'
                  : s?.status === 'error'
                    ? 'error'
                    : s?.status === 'loading'
                      ? 'loading'
                      : 'pending';
              return { label: enc.name, status };
            })}
          />
        </div>
      )}
```

- [ ] **Step 3: Export StepStatus from ProgressSteps**

`StepStatus` is defined in `src/components/ui/ProgressSteps.tsx` but may not be exported. Open the file and verify the export. The file currently has:

```tsx
export type StepStatus = 'pending' | 'loading' | 'done' | 'error';
```

It is already exported — no change needed. If it is not exported, add `export` to the line.

- [ ] **Step 4: Run type-check**

```powershell
pnpm tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```powershell
git add src/components/results/ResultsDashboard.tsx src/components/ui/ProgressSteps.tsx
git commit -m "feat: show ProgressSteps fetch banner in ResultsDashboard"
```

---

### Task 5: Hook tests — vitest jsdom workspace

Hook tests need a DOM environment. Add a vitest workspace split so existing API tests keep `node` env and hook tests get `jsdom`.

**Files:**
- Modify: `vitest.config.ts`
- Install: `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`

- [ ] **Step 1: Install test dependencies**

```powershell
pnpm add -D @testing-library/react @testing-library/jest-dom jsdom
```

Expected: packages resolve without conflicts (React 19 peer dep OK in @testing-library/react ≥ 16)

- [ ] **Step 2: Replace vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    exclude: ['node_modules/**', '.claude/**'],
    workspace: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'src/lib/**/*.test.ts',
            'src/app/api/**/*.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/hooks/**/*.test.ts'],
          setupFiles: ['./src/test-setup.ts'],
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 3: Create src/test-setup.ts**

```ts
import '@testing-library/jest-dom';
```

- [ ] **Step 4: Run existing tests to verify nothing broke**

```powershell
pnpm test
```

Expected: all existing tests pass (same count as before)

- [ ] **Step 5: Commit**

```powershell
git add vitest.config.ts src/test-setup.ts package.json pnpm-lock.yaml
git commit -m "chore: split vitest workspace into node/jsdom environments"
```

---

### Task 6: useAnalysis hook tests

**Files:**
- Create: `src/hooks/__tests__/useAnalysis.test.ts`

The mock boss result shape must match `BossResult` from `@/types`.

- [ ] **Step 1: Create src/hooks/__tests__/useAnalysis.test.ts**

```ts
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BossResult } from '@/types';
import { useAnalysis } from '@/hooks/useAnalysis';

const mockBossResult: BossResult = {
  encounter: 'Chimaerus',
  encounterId: 3306,
  fightTargets: [],
  character: {
    stats: { name: 'Jumbaa', avgIlvl: 635, agility: 13200, crit: 3890, haste: 3500, mastery: 5800, vers: 750, talents: {} },
    rotation: { name: 'Jumbaa', dps: 250000, fightDurationMs: 180000, casts: {}, buffs: {} },
    damageTable: { entries: [] },
    dps: 250000,
    bossDps: null,
    killTime: '3:00',
    overallPct: 95.5,
    overallPctOf: 1000,
    todayPct: 92.1,
    bossDpsPct: null,
    bracket: 0,
  },
  topPlayers: [],
};

const baseInput = {
  characterName: 'Jumbaa',
  serverSlug: 'ysondre',
  region: 'EU' as const,
  difficulty: 4 as const,
  encounters: [{ id: 3306, name: 'Chimaerus' }],
};

function mockFetchOk(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
  } as Response);
}

function mockFetchError(status: number, error: string) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ error }),
  } as unknown as Response);
}

function mockFetchNetworkError() {
  return vi.fn().mockRejectedValue(new Error('Network error'));
}

describe('useAnalysis', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetchOk(mockBossResult));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts in idle state with no boss states', () => {
    const { result } = renderHook(() => useAnalysis());
    expect(result.current.bossStates).toHaveLength(0);
    expect(result.current.input).toBeNull();
    expect(result.current.isAnyLoading).toBe(false);
  });

  it('sets loading state immediately on start()', async () => {
    const { result } = renderHook(() => useAnalysis());

    let loadingSeenDuringFetch = false;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        loadingSeenDuringFetch = result.current.bossStates[0]?.status === 'loading';
        return { ok: true, json: () => Promise.resolve(mockBossResult) } as Response;
      })
    );

    await act(async () => {
      await result.current.start(baseInput);
    });

    expect(loadingSeenDuringFetch).toBe(true);
  });

  it('transitions to success with result after fetch', async () => {
    const { result } = renderHook(() => useAnalysis());

    await act(async () => {
      await result.current.start(baseInput);
    });

    expect(result.current.bossStates[0].status).toBe('success');
    if (result.current.bossStates[0].status === 'success') {
      expect(result.current.bossStates[0].result?.encounter).toBe('Chimaerus');
    }
    expect(result.current.isAnyLoading).toBe(false);
    expect(result.current.input).toEqual(baseInput);
  });

  it('transitions to success with null when API returns null (no parses)', async () => {
    vi.stubGlobal('fetch', mockFetchOk(null));
    const { result } = renderHook(() => useAnalysis());

    await act(async () => {
      await result.current.start(baseInput);
    });

    expect(result.current.bossStates[0].status).toBe('success');
    if (result.current.bossStates[0].status === 'success') {
      expect(result.current.bossStates[0].result).toBeNull();
    }
  });

  it('transitions to error when API returns non-ok response', async () => {
    vi.stubGlobal('fetch', mockFetchError(500, 'WCL rate limit'));
    const { result } = renderHook(() => useAnalysis());

    await act(async () => {
      await result.current.start(baseInput);
    });

    expect(result.current.bossStates[0].status).toBe('error');
    if (result.current.bossStates[0].status === 'error') {
      expect(result.current.bossStates[0].message).toBe('WCL rate limit');
    }
  });

  it('transitions to error on network failure', async () => {
    vi.stubGlobal('fetch', mockFetchNetworkError());
    const { result } = renderHook(() => useAnalysis());

    await act(async () => {
      await result.current.start(baseInput);
    });

    expect(result.current.bossStates[0].status).toBe('error');
    if (result.current.bossStates[0].status === 'error') {
      expect(result.current.bossStates[0].message).toBe('Network error');
    }
  });

  it('returns cached result instantly on difficulty switch back', async () => {
    const { result } = renderHook(() => useAnalysis());

    await act(async () => {
      await result.current.start(baseInput);
    });

    const fetchMock = mockFetchOk(mockBossResult);
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      await result.current.start({ ...baseInput, difficulty: 5 });
    });

    // switch back to 4 — should hit cache, no second fetch for difficulty 4
    const callCountAfterFirst = fetchMock.mock.calls.length;
    await act(async () => {
      await result.current.start(baseInput);
    });
    expect(fetchMock.mock.calls.length).toBe(callCountAfterFirst); // no new fetch
    expect(result.current.bossStates[0].status).toBe('success');
  });

  it('reset() clears all state', async () => {
    const { result } = renderHook(() => useAnalysis());

    await act(async () => {
      await result.current.start(baseInput);
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.bossStates).toHaveLength(0);
    expect(result.current.input).toBeNull();
    expect(result.current.currentDifficulty).toBeNull();
  });
});
```

- [ ] **Step 2: Run the new tests**

```powershell
pnpm test --project dom
```

Expected: 7 tests pass in `src/hooks/__tests__/useAnalysis.test.ts`

- [ ] **Step 3: Commit**

```powershell
git add src/hooks/__tests__/useAnalysis.test.ts
git commit -m "test: add integration tests for useAnalysis hook"
```

---

### Task 7: useAIReport hook tests

**Files:**
- Create: `src/hooks/__tests__/useAIReport.test.ts`

SSE streaming is mocked by constructing a `ReadableStream` that emits the SSE `data:` lines manually.

- [ ] **Step 1: Create src/hooks/__tests__/useAIReport.test.ts**

```ts
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisResult } from '@/types';
import { useAIReport } from '@/hooks/useAIReport';

const mockAnalysisResult: AnalysisResult = {
  input: {
    characterName: 'Jumbaa',
    serverSlug: 'ysondre',
    region: 'EU',
    difficulty: 4,
    encounters: [{ id: 3306, name: 'Chimaerus' }],
  },
  bosses: [null],
  generatedAt: '2026-05-13T00:00:00Z',
};

function makeStreamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return { ok: true, body: stream } as unknown as Response;
}

function sseChunk(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n`;
}

describe('useAIReport', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts in idle state', () => {
    const { result } = renderHook(() => useAIReport());
    expect(result.current.text).toBe('');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.usage).toBeNull();
  });

  it('streams text chunks and sets loading=false when done', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeStreamResponse([
        sseChunk('Hello '),
        sseChunk('world'),
        sseChunk('[DONE]'),
      ])
    );

    const { result } = renderHook(() => useAIReport());

    await act(async () => {
      await result.current.start(mockAnalysisResult, 'test-key', 'groq');
    });

    expect(result.current.text).toBe('Hello world');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('parses usage event and exposes it', async () => {
    const usageData = { inputTokens: 1000, outputTokens: 200, totalTokens: 1200 };
    vi.mocked(fetch).mockResolvedValue(
      makeStreamResponse([
        sseChunk('Analysis complete.'),
        sseChunk({ _meta: 'usage', ...usageData }),
        sseChunk('[DONE]'),
      ])
    );

    const { result } = renderHook(() => useAIReport());

    await act(async () => {
      await result.current.start(mockAnalysisResult, 'test-key', 'groq');
    });

    expect(result.current.text).toBe('Analysis complete.');
    expect(result.current.usage).toMatchObject(usageData);
  });

  it('sets error when API returns non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Invalid API key' }),
    } as unknown as Response);

    const { result } = renderHook(() => useAIReport());

    await act(async () => {
      await result.current.start(mockAnalysisResult, 'bad-key', 'groq');
    });

    expect(result.current.error).toBe('Invalid API key');
    expect(result.current.loading).toBe(false);
  });

  it('sets error on network failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAIReport());

    await act(async () => {
      await result.current.start(mockAnalysisResult, 'test-key', 'groq');
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.loading).toBe(false);
  });

  it('reset() clears text, error, and usage', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeStreamResponse([sseChunk('Some text'), sseChunk('[DONE]')])
    );

    const { result } = renderHook(() => useAIReport());

    await act(async () => {
      await result.current.start(mockAnalysisResult, 'test-key', 'groq');
    });

    expect(result.current.text).toBe('Some text');

    act(() => {
      result.current.reset();
    });

    expect(result.current.text).toBe('');
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('does not set error when aborted (AbortError is swallowed)', async () => {
    vi.mocked(fetch).mockRejectedValue(
      Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' })
    );

    const { result } = renderHook(() => useAIReport());

    await act(async () => {
      await result.current.start(mockAnalysisResult, 'test-key', 'groq');
    });

    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
```

- [ ] **Step 2: Run the new tests**

```powershell
pnpm test --project dom
```

Expected: 6 tests pass in `src/hooks/__tests__/useAIReport.test.ts` (13 total for `dom` project)

- [ ] **Step 3: Commit**

```powershell
git add src/hooks/__tests__/useAIReport.test.ts
git commit -m "test: add integration tests for useAIReport hook"
```

---

### Task 8: Rewrite README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace README.md**

```markdown
# LogLense

Pulls character performance data from Warcraft Logs and compares it against top-ranked players on each boss. Shows stats, rotation, talent diffs, and generates an AI coaching report.

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Get WCL API credentials

Register a client at <https://www.warcraftlogs.com/api/clients/>.
Set the redirect URI to `https://localhost`. Copy the **Client ID** and **Client Secret**.

### 3. Configure environment variables

Copy `.env.example` to `.env.local` and fill in the required values:

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `WCL_CLIENT_ID` | **Yes** | Warcraft Logs API client ID |
| `WCL_CLIENT_SECRET` | **Yes** | Warcraft Logs API client secret |
| `GROQ_API_KEY` | No | Server-side Groq key — users can paste their own in the UI instead |
| `GROQ_MODEL` | No | Override Groq model (default: `llama-3.3-70b-versatile`) |
| `GEMINI_API_KEY` | No | Server-side Gemini key — users can paste their own in the UI |
| `GEMINI_MODEL` | No | Override Gemini model (default: `gemini-2.0-flash-lite`) |
| `ANTHROPIC_API_KEY` | No | Server-side Claude key — users can paste their own in the UI |

If no server-side AI key is set for a provider, the user is prompted to paste their own key in the AI Report tab.

### 4. Start the dev server

```bash
pnpm dev
```

Open <http://localhost:3000>.

---

## Usage

1. Enter your character name, realm, region, and difficulty
2. Select the raid and bosses to analyse
3. Click **Analyse** — results load per-boss as they arrive
4. Switch between **Overview**, **Comparison**, and **AI Report** tabs
5. In AI Report, choose a provider (Groq / Gemini / Claude) and paste your API key if not set server-side

---

## Tech Stack

- **Next.js 16** — App Router, API routes
- **React 19** — client hooks, streaming UI
- **Warcraft Logs API** — GraphQL, OAuth2 client-credentials
- **Groq / Gemini / Claude** — AI coaching report via SSE streaming

---

## Development

```bash
pnpm dev        # start dev server
pnpm build      # production build
pnpm test       # run all tests
pnpm lint       # ESLint
pnpm typecheck  # tsc --noEmit
```

---

## Known Limitations

- **Talent names:** WCL does not resolve talent tree spell IDs to names. The Comparison tab shows talent diffs as node names resolved from the local `feral-druid-talents.json` data file.
- **Bracket percentile:** True ilvl-bracket percentile is not directly queryable from the WCL API.
- **Private logs:** Reports set to private on WCL are inaccessible via the API.
- **Spec support:** Currently tuned for Feral Druid. The AI prompt is spec-agnostic but rotation/talent reference data is Feral-specific.
```

- [ ] **Step 2: Verify the typecheck script exists in package.json**

Open `package.json` and check the `scripts` block. If `typecheck` is missing, add it. Run:

```powershell
pnpm pkg get scripts
```

If `typecheck` is absent, add it:

```powershell
pnpm pkg set scripts.typecheck="tsc --noEmit"
```

- [ ] **Step 3: Run full test suite one last time**

```powershell
pnpm test
```

Expected: all tests pass across both `node` and `dom` projects

- [ ] **Step 4: Commit**

```powershell
git add README.md package.json
git commit -m "docs: rewrite README for Next.js app"
```

---

## Self-Review

**Spec coverage:**
1. ✅ ComparisonTab delta badges — Task 1 (StatsTable), Task 2 (RotationTable)
2. ✅ zonesError via ErrorBanner — Task 3
3. ✅ ProgressSteps wired — Task 4
4. ✅ Hook integration tests — Tasks 6 & 7
5. ✅ README rewrite — Task 8

**Placeholder scan:** No TBDs, no "add error handling" stubs, all code blocks complete.

**Type consistency:**
- `BossResult` shape in test mocks matches `src/types/index.ts` definition exactly (all fields present).
- `StepStatus` imported from `@/components/ui/ProgressSteps` — already exported.
- `castRatio` / `uptimeRatio` helpers use `CastEntry` and `RotationSummary` from `@/types` — consistent with existing hook types.
