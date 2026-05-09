# Phase 3: API Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the WCL pipeline into a Next.js Edge Runtime API route at `POST /api/analyze/[encounterId]` that accepts a character + encounter and returns a `BossResult`.

**Architecture:** Single Edge Runtime route handler that gets a WCL token from env vars, delegates to `analyzeBoss()` from Phase 2, and returns JSON. Edge Runtime is required (Vercel Hobby 30s limit vs serverless 10s). The pipeline uses only `fetch` — no Node.js APIs — so Edge is fully compatible. Tests use `msw` to intercept WCL network calls.

**Tech Stack:** Next.js 15 App Router, Edge Runtime, TypeScript, Vitest, msw

**Prerequisite:** Phase 2 (`src/lib/wcl/pipeline.ts`, `src/types/index.ts`) must be complete.

---

### Task 1: Install msw for integration tests

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install msw**

```
pnpm add -D msw@^2
```

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add msw for API route tests"
```

---

### Task 2: Write analyze route tests

**Files:**
- Create: `src/app/api/analyze/[encounterId]/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/analyze/[encounterId]/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/wcl/auth', () => ({
  getWCLToken: vi.fn().mockResolvedValue('mock-token'),
}));

vi.mock('@/lib/wcl/pipeline', () => ({
  analyzeBoss: vi.fn(),
}));

import { POST } from '../route';
import { analyzeBoss } from '@/lib/wcl/pipeline';
import type { BossResult } from '@/types';

const mockBossResult: BossResult = {
  encounter: 'Chimaerus',
  encounterId: 3306,
  character: {
    stats: {
      name: 'Jumbaa',
      avgIlvl: 635,
      agility: 13200,
      crit: 3890,
      haste: 3500,
      mastery: 5800,
      vers: 750,
      talents: {},
    },
    rotation: {
      name: 'Jumbaa',
      dps: 250000,
      fightDurationMs: 180000,
      cooldowns: {},
      generators: {},
      finishers: {},
      uptime: {},
    },
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

function makeRequest(body: Record<string, unknown>, encounterId = '3306') {
  return new Request(`http://localhost/api/analyze/${encounterId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/analyze/[encounterId]', () => {
  beforeEach(() => {
    vi.mocked(analyzeBoss).mockResolvedValue(mockBossResult);
    process.env.WCL_CLIENT_ID = 'test-id';
    process.env.WCL_CLIENT_SECRET = 'test-secret';
  });

  it('returns BossResult on success', async () => {
    const req = makeRequest({
      characterName: 'Jumbaa',
      serverSlug: 'ysondre',
      region: 'EU',
      difficulty: 5,
      encounterName: 'Chimaerus',
    });

    const res = await POST(req, { params: Promise.resolve({ encounterId: '3306' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.encounter).toBe('Chimaerus');
    expect(body.character.dps).toBe(250000);
  });

  it('returns null when analyzeBoss returns null (no data)', async () => {
    vi.mocked(analyzeBoss).mockResolvedValue(null);

    const req = makeRequest({
      characterName: 'NoData',
      serverSlug: 'ysondre',
      region: 'EU',
      difficulty: 5,
      encounterName: 'Chimaerus',
    });

    const res = await POST(req, { params: Promise.resolve({ encounterId: '3306' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toBeNull();
  });

  it('returns 400 for non-numeric encounterId', async () => {
    const req = makeRequest(
      { characterName: 'Jumbaa', serverSlug: 'ysondre', region: 'EU', difficulty: 5, encounterName: 'X' },
      'not-a-number'
    );

    const res = await POST(req, { params: Promise.resolve({ encounterId: 'not-a-number' }) });
    expect(res.status).toBe(400);
  });

  it('returns 500 when WCL credentials are missing', async () => {
    delete process.env.WCL_CLIENT_ID;
    delete process.env.WCL_CLIENT_SECRET;

    const req = makeRequest({
      characterName: 'Jumbaa',
      serverSlug: 'ysondre',
      region: 'EU',
      difficulty: 5,
      encounterName: 'Chimaerus',
    });

    const res = await POST(req, { params: Promise.resolve({ encounterId: '3306' }) });
    expect(res.status).toBe(500);
  });

  it('returns 500 when analyzeBoss throws', async () => {
    vi.mocked(analyzeBoss).mockRejectedValue(new Error('WCL rate limit'));

    const req = makeRequest({
      characterName: 'Jumbaa',
      serverSlug: 'ysondre',
      region: 'EU',
      difficulty: 5,
      encounterName: 'Chimaerus',
    });

    const res = await POST(req, { params: Promise.resolve({ encounterId: '3306' }) });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('WCL rate limit');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
pnpm test "src/app/api/analyze"
```
Expected: FAIL — `../route` module not found.

---

### Task 3: Implement the analyze route

**Files:**
- Create: `src/app/api/analyze/[encounterId]/route.ts`

- [ ] **Step 1: Create src/app/api/analyze/[encounterId]/route.ts**

```ts
import { type NextRequest, NextResponse } from 'next/server';
import { getWCLToken } from '@/lib/wcl/auth';
import { analyzeBoss } from '@/lib/wcl/pipeline';
import type { AnalysisInput } from '@/types';

export const runtime = 'edge';

interface AnalyzeBody {
  characterName: string;
  serverSlug: string;
  region: AnalysisInput['region'];
  difficulty: AnalysisInput['difficulty'];
  encounterName: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ encounterId: string }> }
) {
  const { encounterId } = await params;
  const encounterIdNum = parseInt(encounterId, 10);

  if (isNaN(encounterIdNum)) {
    return NextResponse.json({ error: 'Invalid encounter ID' }, { status: 400 });
  }

  const clientId = process.env.WCL_CLIENT_ID;
  const clientSecret = process.env.WCL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'WCL credentials not configured' }, { status: 500 });
  }

  const body = (await req.json()) as AnalyzeBody;

  try {
    const token = await getWCLToken(clientId, clientSecret);

    const input: AnalysisInput = {
      characterName: body.characterName,
      serverSlug: body.serverSlug,
      region: body.region,
      difficulty: body.difficulty,
      encounters: [{ id: encounterIdNum, name: body.encounterName }],
    };

    const result = await analyzeBoss(token, input, encounterIdNum, body.encounterName);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Run tests to verify they pass**

```
pnpm test "src/app/api/analyze"
```
Expected: PASS — 5 passed.

- [ ] **Step 3: Run typecheck**

```
pnpm typecheck
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/analyze/ package.json pnpm-lock.yaml
git commit -m "feat: add Edge Runtime analyze API route"
```

---

### Task 4: Run full suite and push

- [ ] **Step 1: Run all tests**

```
pnpm test
```
Expected: All tests pass.

- [ ] **Step 2: Run quality checks**

```
pnpm typecheck && pnpm lint && pnpm format:check
```
Expected: No errors.

- [ ] **Step 3: Push**

```bash
git push
```
Expected: GitHub Actions CI passes.

---

### Verification

- [ ] `pnpm test` — all tests pass including analyze route (5 tests)
- [ ] `pnpm typecheck` — zero errors
- [ ] `pnpm lint` — zero errors
- [ ] Route file has `export const runtime = 'edge'`
- [ ] Route returns `NextResponse.json(null)` (status 200) when `analyzeBoss` returns null — not a 404
- [ ] WCL_CLIENT_ID/WCL_CLIENT_SECRET are read per-request inside the handler (not at module scope)
