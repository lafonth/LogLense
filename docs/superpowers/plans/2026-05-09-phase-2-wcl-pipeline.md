# Phase 2: WCL Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Python WarcraftLogs data pipeline (`legacy/analyze_character.py`) to TypeScript, fully unit-tested, producing the same `BossResult` shape from the same WCL GraphQL API.

**Architecture:** Pure TypeScript library in `src/lib/wcl/` with no Next.js dependencies — just `fetch` and typed interfaces. Built TDD: types first, then each module with its tests, then the pipeline that wires them together.

**Tech Stack:** TypeScript, Vitest, WarcraftLogs GraphQL API v2 (OAuth2 client credentials)

---

### Task 1: Define all shared types

**Files:**
- Create: `src/types/index.ts`

- [ ] **Step 1: Create src/types/index.ts**

```ts
export interface Encounter {
  id: number;
  name: string;
}

export interface AnalysisInput {
  characterName: string;
  serverSlug: string;
  region: 'US' | 'EU' | 'KR' | 'TW' | 'CN';
  difficulty: 3 | 4 | 5;
  encounters: Encounter[];
}

export interface CharacterStats {
  name: string;
  avgIlvl: number;
  agility: number;
  crit: number;
  haste: number;
  mastery: number;
  vers: number;
  talents: Record<number, number>;
}

export interface CastEntry {
  casts: number;
  perMin: number;
}

export interface RotationSummary {
  name: string;
  dps?: number;
  fightDurationMs: number;
  cooldowns: Record<string, CastEntry>;
  generators: Record<string, CastEntry>;
  finishers: Record<string, CastEntry>;
  uptime: Record<string, number>;
}

export interface DamageEntry {
  name: string;
  total: number;
}

export interface TopPlayer {
  stats: CharacterStats & { dps: number; killTime: string };
  rotation: RotationSummary;
}

export interface BossResult {
  encounter: string;
  encounterId: number;
  character: {
    stats: CharacterStats;
    rotation: RotationSummary;
    damageTable: { entries: DamageEntry[] };
    dps: number;
    bossDps: number | null;
    killTime: string;
    overallPct: number;
    overallPctOf: number | '?';
    todayPct: number;
    bossDpsPct: number | null;
    bracket: number;
  };
  topPlayers: TopPlayer[];
}

export interface AnalysisResult {
  input: AnalysisInput;
  bosses: (BossResult | null)[];
  generatedAt: string;
}
```

- [ ] **Step 2: Verify typecheck**

```
pnpm typecheck
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add shared TypeScript interfaces"
```

---

### Task 2: Constants and tracked abilities

**Files:**
- Create: `src/lib/wcl/constants.ts`

- [ ] **Step 1: Create src/lib/wcl/constants.ts**

```ts
export const TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';
export const API_URL = 'https://www.warcraftlogs.com/api/v2/client';

export const FERAL_SPEC_ID = 103;
export const KILL_TIME_TOLERANCE = 0.2;
export const TOP_N = 3;

export const TRACKED_ABILITIES: Record<string, number> = {
  "Tiger's Fury": 5217,
  Berserk: 106951,
  Incarnation: 102543,
  'Feral Frenzy': 274837,
  'Frantic Frenzy': 1243807,
  'Convoke the Spirits': 391528,
  Rip: 1079,
  Rake: 1822,
  'Ferocious Bite': 22568,
  'Primal Wrath': 285381,
  Shred: 5221,
  Swipe: 106785,
  Thrash: 106832,
  Moonfire: 8921,
  'Moonfire (LI)': 155625,
  'Brutal Slash': 202028,
};

export const GUID_TO_NAME: Record<number, string> = Object.fromEntries(
  Object.entries(TRACKED_ABILITIES).map(([name, id]) => [id, name])
);

export const UPTIME_BUFFS = new Set(["Tiger's Fury"]);
export const UPTIME_DEBUFFS = new Set(['Rip', 'Rake']);
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/wcl/constants.ts
git commit -m "feat: add WCL constants and tracked ability IDs"
```

---

### Task 3: GraphQL query strings

**Files:**
- Create: `src/lib/wcl/queries.ts`

- [ ] **Step 1: Create src/lib/wcl/queries.ts**

```ts
export const Q_CHARACTER_RANKINGS = `
  query CharacterRankings(
    $name: String!, $slug: String!, $region: String!,
    $encounterID: Int!, $difficulty: Int!
  ) {
    characterData {
      character(name: $name, serverSlug: $slug, serverRegion: $region) {
        name
        server { slug region { slug } }
        dps: encounterRankings(
          encounterID: $encounterID, difficulty: $difficulty,
          metric: dps, specName: "Feral"
        )
        boss: encounterRankings(
          encounterID: $encounterID, difficulty: $difficulty,
          metric: bossdps, specName: "Feral"
        )
      }
    }
  }
`;

export const Q_WORLD_RANKINGS = `
  query WorldRankings($encounterID: Int!, $difficulty: Int!) {
    worldData {
      encounter(id: $encounterID) {
        characterRankings(
          specName: "Feral", className: "Druid",
          metric: dps, difficulty: $difficulty, leaderboard: LogsOnly
        )
      }
    }
  }
`;

export const Q_COMBATANT = `
  query Combatant($code: String!, $fightIDs: [Int]!) {
    reportData {
      report(code: $code) {
        events(dataType: CombatantInfo, fightIDs: $fightIDs) { data }
      }
    }
  }
`;

export const Q_DAMAGE = `
  query Damage($code: String!, $fightIDs: [Int]!, $sourceID: Int!) {
    reportData {
      report(code: $code) {
        table(dataType: DamageDone, fightIDs: $fightIDs, sourceID: $sourceID, wipeCutoff: 0)
      }
    }
  }
`;

export const Q_ROTATION = `
  query Rotation($code: String!, $fightIDs: [Int]!, $sourceID: Int!) {
    reportData {
      report(code: $code) {
        casts:   table(dataType: Casts,   fightIDs: $fightIDs, sourceID: $sourceID)
        buffs:   table(dataType: Buffs,   fightIDs: $fightIDs, sourceID: $sourceID)
        debuffs: table(dataType: Debuffs, fightIDs: $fightIDs, sourceID: $sourceID)
      }
    }
  }
`;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/wcl/queries.ts
git commit -m "feat: add WCL GraphQL query strings"
```

---

### Task 4: OAuth token fetching

**Files:**
- Create: `src/lib/wcl/auth.ts`
- Create: `src/lib/wcl/__tests__/auth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/wcl/__tests__/auth.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getWCLToken } from '../auth';

describe('getWCLToken', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns access token on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'test-token-123' }),
    } as Response);

    const token = await getWCLToken('client-id', 'client-secret');

    expect(token).toBe('test-token-123');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://www.warcraftlogs.com/oauth/token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
        }),
      })
    );
  });

  it('throws on HTTP error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    await expect(getWCLToken('bad', 'creds')).rejects.toThrow('WCL auth failed: 401');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm test src/lib/wcl/__tests__/auth.test.ts
```
Expected: FAIL — `getWCLToken` not defined.

- [ ] **Step 3: Create src/lib/wcl/auth.ts**

```ts
import { TOKEN_URL } from './constants';

export async function getWCLToken(clientId: string, clientSecret: string): Promise<string> {
  const credentials = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    throw new Error(`WCL auth failed: ${res.status}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}
```

- [ ] **Step 4: Run test to verify it passes**

```
pnpm test src/lib/wcl/__tests__/auth.test.ts
```
Expected: PASS — 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/wcl/auth.ts src/lib/wcl/__tests__/auth.test.ts
git commit -m "feat: add WCL OAuth token fetching"
```

---

### Task 5: GraphQL client wrapper

**Files:**
- Create: `src/lib/wcl/client.ts`
- Create: `src/lib/wcl/__tests__/client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/wcl/__tests__/client.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gql } from '../client';

describe('gql', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns data on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { worldData: { encounter: {} } } }),
    } as Response);

    const result = await gql<{ worldData: unknown }>('token', '{ worldData { encounter } }');
    expect(result).toEqual({ worldData: { encounter: {} } });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://www.warcraftlogs.com/api/v2/client',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      })
    );
  });

  it('throws on GraphQL errors array', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ errors: [{ message: 'Not found' }] }),
    } as Response);

    await expect(gql('token', 'query {}')).rejects.toThrow('WCL GraphQL error');
  });

  it('throws on HTTP error', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 } as Response);
    await expect(gql('token', 'query {}')).rejects.toThrow('WCL request failed: 429');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm test src/lib/wcl/__tests__/client.test.ts
```
Expected: FAIL — `gql` not defined.

- [ ] **Step 3: Create src/lib/wcl/client.ts**

```ts
import { API_URL } from './constants';

export async function gql<T>(
  token: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, ...(variables ? { variables } : {}) }),
  });

  if (!res.ok) {
    throw new Error(`WCL request failed: ${res.status}`);
  }

  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };

  if (body.errors?.length) {
    throw new Error(`WCL GraphQL error: ${body.errors[0].message}`);
  }

  return body.data as T;
}
```

- [ ] **Step 4: Run test to verify it passes**

```
pnpm test src/lib/wcl/__tests__/client.test.ts
```
Expected: PASS — 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/wcl/client.ts src/lib/wcl/__tests__/client.test.ts
git commit -m "feat: add WCL GraphQL client wrapper"
```

---

### Task 6: Data parsers

**Files:**
- Create: `src/lib/wcl/parsers.ts`
- Create: `src/lib/wcl/__tests__/parsers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/wcl/__tests__/parsers.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseStats, parseCasts, parseUptime, summarizeRotation, fmtMs } from '../parsers';

describe('fmtMs', () => {
  it('formats milliseconds to M:SS', () => {
    expect(fmtMs(263000)).toBe('4:23');
    expect(fmtMs(60000)).toBe('1:00');
    expect(fmtMs(75000)).toBe('1:15');
  });
});

describe('parseStats', () => {
  it('returns null for null event', () => {
    expect(parseStats(null, 'Player')).toBeNull();
  });

  it('parses stats from a combatant event', () => {
    const event = {
      specID: 103,
      gear: [
        { itemLevel: 635, id: 1, quality: 4 },
        { itemLevel: 620, id: 2, quality: 4 },
        { itemLevel: 10, id: 3, quality: 1 }, // cosmetic, excluded
      ],
      agility: 13200,
      critMelee: 3890,
      hasteMelee: 3500,
      mastery: 5800,
      versatilityDamageDone: 750,
      talentTree: [{ id: 395152, rank: 1 }, { id: 391528, rank: 1 }],
    };

    const stats = parseStats(event, 'Jumbaa');
    expect(stats).not.toBeNull();
    expect(stats!.name).toBe('Jumbaa');
    expect(stats!.avgIlvl).toBe(627.5); // (635 + 620) / 2, excludes ilvl < 50
    expect(stats!.agility).toBe(13200);
    expect(stats!.crit).toBe(3890);
    expect(stats!.haste).toBe(3500);
    expect(stats!.mastery).toBe(5800);
    expect(stats!.vers).toBe(750);
    expect(stats!.talents).toEqual({ 395152: 1, 391528: 1 });
  });
});

describe('parseCasts', () => {
  it('converts cast counts to casts-per-minute', () => {
    const table = {
      data: {
        entries: [
          { guid: 5217, name: "Tiger's Fury", total: 10 },  // GUID_TO_NAME lookup
          { guid: 99999, name: 'Unknown Spell', total: 5 }, // untracked, keep with original name
        ],
      },
    };
    const result = parseCasts(table, 120000); // 2 min fight

    expect(result["Tiger's Fury"].casts).toBe(10);
    expect(result["Tiger's Fury"].perMin).toBe(5); // 10 / 2min
    expect(result['Unknown Spell'].casts).toBe(5);
  });
});

describe('parseUptime', () => {
  it('calculates uptime percentage for wanted abilities', () => {
    const table = {
      data: {
        auras: [
          { guid: 5217, name: "Tiger's Fury", totalUptime: 30000, totalUses: 5 }, // tracked
          { guid: 9999, name: 'Other Buff', totalUptime: 60000, totalUses: 1 },   // not wanted
        ],
      },
    };
    const wanted = new Set(["Tiger's Fury"]);
    const result = parseUptime(table, 120000, wanted);

    expect(result["Tiger's Fury"]).toBeDefined();
    expect(result["Tiger's Fury"].uptimePct).toBe(25); // 30000/120000 * 100
    expect(result['Other Buff']).toBeUndefined();
  });
});

describe('summarizeRotation', () => {
  it('combines Moonfire + Moonfire (LI) into single Moonfire entry', () => {
    const casts = {
      'Moonfire': { casts: 3, perMin: 1 },
      'Moonfire (LI)': { casts: 6, perMin: 2 },
      "Tiger's Fury": { casts: 10, perMin: 5 },
      Berserk: { casts: 4, perMin: 2 },
      Incarnation: { casts: 0, perMin: 0 },
      'Feral Frenzy': { casts: 2, perMin: 1 },
      'Frantic Frenzy': { casts: 0, perMin: 0 },
      'Convoke the Spirits': { casts: 2, perMin: 1 },
      Shred: { casts: 40, perMin: 20 },
      Swipe: { casts: 5, perMin: 2.5 },
      Rip: { casts: 8, perMin: 4 },
      'Ferocious Bite': { casts: 12, perMin: 6 },
      'Primal Wrath': { casts: 0, perMin: 0 },
    };
    const buffUptime = { "Tiger's Fury": { uptimePct: 28, applications: 10 } };
    const debuffUptime = {
      Rip: { uptimePct: 88, applications: 8 },
      Rake: { uptimePct: 92, applications: 10 },
    };

    const summary = summarizeRotation('Jumbaa', casts, buffUptime, debuffUptime, 120000, 250000);

    expect(summary.generators['Moonfire'].casts).toBe(9); // 3 + 6 combined
    expect(summary.cooldowns['Berserk'].casts).toBe(4);   // Incarnation=0, so just Berserk
    expect(summary.uptime["Tiger's Fury %"]).toBe(28);
    expect(summary.uptime['Rip %']).toBe(88);
    expect(summary.dps).toBe(250000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
pnpm test src/lib/wcl/__tests__/parsers.test.ts
```
Expected: FAIL — `parseStats`, `parseCasts` etc. not defined.

- [ ] **Step 3: Create src/lib/wcl/parsers.ts**

```ts
import { GUID_TO_NAME } from './constants';
import type { CharacterStats, CastEntry, RotationSummary } from '@/types';

interface CombatantEvent {
  specID: number;
  gear?: { itemLevel: number; id: number; quality: number }[];
  agility?: number;
  critMelee?: number;
  hasteMelee?: number;
  mastery?: number;
  versatilityDamageDone?: number;
  talentTree?: { id: number; rank?: number }[];
}

interface WCLCastEntry {
  guid: number;
  name: string;
  total: number;
}

interface WCLAuraEntry {
  guid: number;
  name: string;
  totalUptime: number;
  totalUses: number;
}

interface WCLTable {
  data?: {
    entries?: WCLCastEntry[];
    auras?: WCLAuraEntry[];
  };
}

export interface UptimeEntry {
  uptimePct: number;
  applications: number;
}

export function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function parseStats(event: CombatantEvent | null, name: string): CharacterStats | null {
  if (!event) return null;
  const gear = (event.gear ?? []).filter((g) => g.itemLevel >= 50);
  const avgIlvl =
    gear.length > 0
      ? Math.round((gear.reduce((sum, g) => sum + g.itemLevel, 0) / gear.length) * 10) / 10
      : 0;

  return {
    name,
    avgIlvl,
    agility: event.agility ?? 0,
    crit: event.critMelee ?? 0,
    haste: event.hasteMelee ?? 0,
    mastery: event.mastery ?? 0,
    vers: event.versatilityDamageDone ?? 0,
    talents: Object.fromEntries(
      (event.talentTree ?? []).map((t) => [t.id, t.rank ?? 1])
    ),
  };
}

export function parseCasts(table: WCLTable, fightMs: number): Record<string, CastEntry> {
  const durMin = fightMs / 60000;
  const result: Record<string, CastEntry> = {};
  for (const entry of table.data?.entries ?? []) {
    const name = GUID_TO_NAME[entry.guid] ?? entry.name;
    result[name] = {
      casts: entry.total,
      perMin: Math.round((entry.total / durMin) * 100) / 100,
    };
  }
  return result;
}

export function parseUptime(
  table: WCLTable,
  fightMs: number,
  wanted: Set<string>
): Record<string, UptimeEntry> {
  const result: Record<string, UptimeEntry> = {};
  for (const aura of table.data?.auras ?? []) {
    const name = GUID_TO_NAME[aura.guid] ?? aura.name;
    if (!wanted.has(name)) continue;
    result[name] = {
      uptimePct: fightMs > 0 ? Math.round((aura.totalUptime / fightMs) * 1000) / 10 : 0,
      applications: aura.totalUses,
    };
  }
  return result;
}

function c(casts: Record<string, CastEntry>, ability: string) {
  return casts[ability]?.casts ?? 0;
}

function pm(casts: Record<string, CastEntry>, fightMs: number, totalCasts: number) {
  return Math.round((totalCasts / (fightMs / 60000)) * 100) / 100;
}

export function summarizeRotation(
  name: string,
  casts: Record<string, CastEntry>,
  buffUptime: Record<string, UptimeEntry>,
  debuffUptime: Record<string, UptimeEntry>,
  fightMs: number,
  dps?: number
): RotationSummary {
  const frenzy = c(casts, 'Feral Frenzy') + c(casts, 'Frantic Frenzy');
  const berserk = c(casts, 'Berserk') + c(casts, 'Incarnation');
  const moonfire = c(casts, 'Moonfire') + c(casts, 'Moonfire (LI)');

  return {
    name,
    dps,
    fightDurationMs: fightMs,
    cooldowns: {
      "Tiger's Fury": casts["Tiger's Fury"] ?? { casts: 0, perMin: 0 },
      Frenzy: { casts: frenzy, perMin: pm(casts, fightMs, frenzy) },
      Berserk: { casts: berserk, perMin: pm(casts, fightMs, berserk) },
      Convoke: casts['Convoke the Spirits'] ?? { casts: 0, perMin: 0 },
    },
    generators: {
      Shred: casts['Shred'] ?? { casts: 0, perMin: 0 },
      Swipe: casts['Swipe'] ?? { casts: 0, perMin: 0 },
      Moonfire: { casts: moonfire, perMin: pm(casts, fightMs, moonfire) },
    },
    finishers: {
      Rip: casts['Rip'] ?? { casts: 0, perMin: 0 },
      'Ferocious Bite': casts['Ferocious Bite'] ?? { casts: 0, perMin: 0 },
      'Primal Wrath': casts['Primal Wrath'] ?? { casts: 0, perMin: 0 },
    },
    uptime: {
      "Tiger's Fury %": buffUptime["Tiger's Fury"]?.uptimePct ?? 0,
      'Rip %': debuffUptime['Rip']?.uptimePct ?? 0,
      'Rake %': debuffUptime['Rake']?.uptimePct ?? 0,
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
pnpm test src/lib/wcl/__tests__/parsers.test.ts
```
Expected: PASS — all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/wcl/parsers.ts src/lib/wcl/__tests__/parsers.test.ts
git commit -m "feat: add WCL data parsers with full test coverage"
```

---

### Task 7: Main analysis pipeline

**Files:**
- Create: `src/lib/wcl/pipeline.ts`

- [ ] **Step 1: Create src/lib/wcl/pipeline.ts**

This is a direct port of `analyze_boss()` and `main()` from `legacy/analyze_character.py`.

```ts
import type { AnalysisInput, BossResult, AnalysisResult, CharacterStats } from '@/types';
import { getWCLToken } from './auth';
import { gql } from './client';
import {
  FERAL_SPEC_ID,
  KILL_TIME_TOLERANCE,
  TOP_N,
  UPTIME_BUFFS,
  UPTIME_DEBUFFS,
} from './constants';
import { parseStats, parseCasts, parseUptime, summarizeRotation, fmtMs } from './parsers';
import {
  Q_CHARACTER_RANKINGS,
  Q_WORLD_RANKINGS,
  Q_COMBATANT,
  Q_DAMAGE,
  Q_ROTATION,
} from './queries';

interface CombatantEvent {
  sourceID: number;
  specID: number;
  gear?: { itemLevel: number; id: number; quality: number }[];
  agility?: number;
  critMelee?: number;
  hasteMelee?: number;
  mastery?: number;
  versatilityDamageDone?: number;
  talentTree?: { id: number; rank?: number }[];
}

async function getFeralEvent(
  token: string,
  code: string,
  fightId: number
): Promise<CombatantEvent | null> {
  const data = await gql<{
    reportData: { report: { events: { data: CombatantEvent[] } } };
  }>(token, Q_COMBATANT, { code, fightIDs: [fightId] });

  return (
    data.reportData.report.events.data.find((e) => e.specID === FERAL_SPEC_ID) ?? null
  );
}

export async function analyzeBoss(
  token: string,
  input: AnalysisInput,
  encounterId: number,
  encounterName: string
): Promise<BossResult | null> {
  const { characterName: name, serverSlug: slug, region, difficulty } = input;

  // 1. Character's best parses
  const charData = await gql<{
    characterData: {
      character: {
        dps: { ranks: Array<{
          amount: number; duration: number; rankPercent: number;
          todayPercent: number; bracketData: number;
          rankTotalParses: number | '?';
          report: { code: string; fightID: number };
        }> };
        boss: { ranks: Array<{
          amount: number; rankPercent: number; rankTotalParses: number | '?';
          report: { code: string; fightID: number };
        }> };
      } | null;
    };
  }>(token, Q_CHARACTER_RANKINGS, { name, slug, region, encounterID: encounterId, difficulty });

  const char = charData.characterData.character;
  if (!char) return null;

  const dpsParses = char.dps?.ranks ?? [];
  const bossParses = char.boss?.ranks ?? [];
  if (dpsParses.length === 0) return null;

  const best = dpsParses.reduce((a, b) => (a.amount > b.amount ? a : b));
  const bestDps = Math.round(best.amount);
  const bestKillMs = best.duration;
  const bestCode = best.report.code;
  const bestFightId = best.report.fightID;

  const bossMatch = bossParses.find(
    (p) => p.report.code === bestCode && p.report.fightID === bestFightId
  ) ?? null;

  // 2. Character's detailed data
  const charEvent = await getFeralEvent(token, bestCode, bestFightId);
  if (!charEvent) return null;

  const [dmgData, rotData] = await Promise.all([
    gql<{ reportData: { report: { table: { data: { entries: { guid: number; name: string; total: number }[] } } } } }>(
      token, Q_DAMAGE, { code: bestCode, fightIDs: [bestFightId], sourceID: charEvent.sourceID }
    ),
    gql<{ reportData: { report: {
      casts: { data: { entries: { guid: number; name: string; total: number }[] } };
      buffs: { data: { auras: { guid: number; name: string; totalUptime: number; totalUses: number }[] } };
      debuffs: { data: { auras: { guid: number; name: string; totalUptime: number; totalUses: number }[] } };
    } } }>(
      token, Q_ROTATION, { code: bestCode, fightIDs: [bestFightId], sourceID: charEvent.sourceID }
    ),
  ]);

  const charStats = parseStats(charEvent, name);
  if (!charStats) return null;

  const charCasts = parseCasts(rotData.reportData.report.casts as never, bestKillMs);
  const charBuffs = parseUptime(rotData.reportData.report.buffs as never, bestKillMs, UPTIME_BUFFS);
  const charDebuffs = parseUptime(rotData.reportData.report.debuffs as never, bestKillMs, UPTIME_DEBUFFS);
  const charRotation = summarizeRotation(name, charCasts, charBuffs, charDebuffs, bestKillMs, bestDps);

  const damageEntries = (dmgData.reportData.report.table.data?.entries ?? []).map((e) => ({
    name: e.name,
    total: e.total,
  }));

  // 3. World rankings filtered by kill time
  const worldData = await gql<{
    worldData: { encounter: { characterRankings: { rankings: Array<{
      name: string; amount: number; duration: number;
      report: { code: string; fightID: number };
    }> } } };
  }>(token, Q_WORLD_RANKINGS, { encounterID: encounterId, difficulty });

  const allWorld = worldData.worldData.encounter.characterRankings.rankings ?? [];
  const lo = bestKillMs * (1 - KILL_TIME_TOLERANCE);
  const hi = bestKillMs * (1 + KILL_TIME_TOLERANCE);
  const similar = allWorld.filter((r) => r.duration >= lo && r.duration <= hi);
  const topPool = similar.length > 0 ? similar.slice(0, TOP_N) : allWorld.slice(0, TOP_N);

  // 4. Top players' data — sequential to avoid WCL rate limits
  const topPlayers = [];
  for (const player of topPool) {
    const { code: pCode, fightID: pFight } = player.report;
    if (!pCode || !pFight) continue;

    const pEvent = await getFeralEvent(token, pCode, pFight);
    if (!pEvent) continue;

    const pRot = await gql<{ reportData: { report: {
      casts: never; buffs: never; debuffs: never;
    } } }>(token, Q_ROTATION, { code: pCode, fightIDs: [pFight], sourceID: pEvent.sourceID });

    const pStats = parseStats(pEvent, player.name);
    if (!pStats) continue;

    const pCasts = parseCasts(pRot.reportData.report.casts, player.duration);
    const pBuffs = parseUptime(pRot.reportData.report.buffs, player.duration, UPTIME_BUFFS);
    const pDebuffs = parseUptime(pRot.reportData.report.debuffs, player.duration, UPTIME_DEBUFFS);
    const pRotation = summarizeRotation(player.name, pCasts, pBuffs, pDebuffs, player.duration, Math.round(player.amount));

    const pStatsWithMeta: CharacterStats & { dps: number; killTime: string } = {
      ...pStats,
      dps: Math.round(player.amount),
      killTime: fmtMs(player.duration),
    };

    topPlayers.push({ stats: pStatsWithMeta, rotation: pRotation });
  }

  return {
    encounter: encounterName,
    encounterId,
    character: {
      stats: charStats,
      rotation: charRotation,
      damageTable: { entries: damageEntries },
      dps: bestDps,
      bossDps: bossMatch ? Math.round(bossMatch.amount) : null,
      killTime: fmtMs(bestKillMs),
      overallPct: Math.round(best.rankPercent * 10) / 10,
      overallPctOf: best.rankTotalParses,
      todayPct: Math.round(best.todayPercent * 10) / 10,
      bossDpsPct: bossMatch ? Math.round(bossMatch.rankPercent * 10) / 10 : null,
      bracket: best.bracketData,
    },
    topPlayers,
  };
}

export async function runAnalysis(input: AnalysisInput): Promise<AnalysisResult> {
  const clientId = process.env.WCL_CLIENT_ID;
  const clientSecret = process.env.WCL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('WCL_CLIENT_ID and WCL_CLIENT_SECRET environment variables are required');
  }

  const token = await getWCLToken(clientId, clientSecret);

  const bosses = await Promise.all(
    input.encounters.map((enc) => analyzeBoss(token, input, enc.id, enc.name).catch(() => null))
  );

  return {
    input,
    bosses,
    generatedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 2: Verify typecheck**

```
pnpm typecheck
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/wcl/pipeline.ts
git commit -m "feat: add WCL analysis pipeline (port of analyze_character.py)"
```

---

### Task 8: Run full test suite

- [ ] **Step 1: Run all tests**

```
pnpm test
```
Expected: All tests pass (auth, client, parsers + example).

- [ ] **Step 2: Run typecheck and lint**

```
pnpm typecheck && pnpm lint
```
Expected: No errors.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete WCL data pipeline with tests"
git push
```

Expected: GitHub Actions CI passes.

---

### Verification

- [ ] `pnpm test` — all tests pass including parsers (fmtMs, parseStats, parseCasts, parseUptime, summarizeRotation)
- [ ] `pnpm typecheck` — zero errors
- [ ] `pnpm lint` — zero errors
- [ ] Moonfire (LI) spell ID 155625 is combined with Moonfire 8921 in `summarizeRotation`
- [ ] `versatilityDamageDone` field used in `parseStats` (not `versatility`)
- [ ] Kill time stays in milliseconds throughout the pipeline; `fmtMs` only called for display
