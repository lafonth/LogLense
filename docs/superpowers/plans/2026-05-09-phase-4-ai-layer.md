# Phase 4: AI Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AI provider abstraction (`AIProvider` interface + `ClaudeProvider`), the prompt builder (`buildAnalysisPrompt`), and the `POST /api/ai-report` Edge Runtime route that streams a Claude analysis as Server-Sent Events.

**Architecture:** Three focused files in `src/lib/ai/` (provider interface, Claude implementation, prompt builder) plus the SSE route. The `AIProvider` interface keeps future model swaps cheap. The route reads `X-AI-Key` from request headers — never logs it. The SSE stream uses `TransformStream` to flush chunks to the browser as they arrive from Claude.

**Tech Stack:** Next.js 15 Edge Runtime, `@anthropic-ai/sdk`, TypeScript, Vitest

**Prerequisite:** Phase 3 complete. `src/types/index.ts` with `AnalysisResult`, `BossResult`, `RotationSummary`, `CharacterStats` must exist.

---

### Task 1: Install Anthropic SDK

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install @anthropic-ai/sdk**

```
pnpm add @anthropic-ai/sdk
```

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add @anthropic-ai/sdk"
```

---

### Task 2: AIProvider interface

**Files:**
- Create: `src/lib/ai/provider.ts`

- [ ] **Step 1: Create src/lib/ai/provider.ts**

```ts
export interface AIProvider {
  stream(prompt: string, systemPrompt: string): ReadableStream<string>;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ai/provider.ts
git commit -m "feat: add AIProvider interface"
```

---

### Task 3: Prompt builder

**Files:**
- Create: `src/lib/ai/prompt.ts`
- Create: `src/lib/ai/__tests__/prompt.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/__tests__/prompt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildAnalysisPrompt, SYSTEM_PROMPT } from '../prompt';
import type { AnalysisResult, BossResult } from '@/types';

function makeBoss(overrides: Partial<BossResult['character']> = {}): BossResult {
  return {
    encounter: 'Chimaerus',
    encounterId: 3306,
    character: {
      stats: { name: 'Jumbaa', avgIlvl: 635, agility: 13200, crit: 3890, haste: 3500, mastery: 5800, vers: 750, talents: { 391528: 1 } },
      rotation: {
        name: 'Jumbaa',
        dps: 250000,
        fightDurationMs: 180000,
        cooldowns: { "Tiger's Fury": { casts: 10, perMin: 3.33 }, Berserk: { casts: 3, perMin: 1 }, Frenzy: { casts: 2, perMin: 0.67 }, Convoke: { casts: 2, perMin: 0.67 } },
        generators: { Shred: { casts: 60, perMin: 20 }, Swipe: { casts: 5, perMin: 1.67 }, Moonfire: { casts: 8, perMin: 2.67 } },
        finishers: { Rip: { casts: 9, perMin: 3 }, 'Ferocious Bite': { casts: 12, perMin: 4 }, 'Primal Wrath': { casts: 0, perMin: 0 } },
        uptime: { "Tiger's Fury %": 28, 'Rip %': 88, 'Rake %': 92 },
      },
      damageTable: { entries: [{ name: 'Shred', total: 5000000 }, { name: 'Rip', total: 3000000 }] },
      dps: 250000,
      bossDps: null,
      killTime: '3:00',
      overallPct: 95.5,
      overallPctOf: 1000,
      todayPct: 92.1,
      bossDpsPct: null,
      bracket: 0,
      ...overrides,
    },
    topPlayers: [
      {
        stats: { name: 'TopPlayer1', avgIlvl: 639, agility: 13800, crit: 4100, haste: 3600, mastery: 5900, vers: 800, dps: 290000, killTime: '2:55', talents: { 391528: 1, 395152: 1 } },
        rotation: {
          name: 'TopPlayer1',
          dps: 290000,
          fightDurationMs: 175000,
          cooldowns: { "Tiger's Fury": { casts: 11, perMin: 3.77 }, Berserk: { casts: 3, perMin: 1.03 }, Frenzy: { casts: 3, perMin: 1.03 }, Convoke: { casts: 3, perMin: 1.03 } },
          generators: { Shred: { casts: 65, perMin: 22.29 }, Swipe: { casts: 2, perMin: 0.69 }, Moonfire: { casts: 10, perMin: 3.43 } },
          finishers: { Rip: { casts: 11, perMin: 3.77 }, 'Ferocious Bite': { casts: 14, perMin: 4.8 }, 'Primal Wrath': { casts: 0, perMin: 0 } },
          uptime: { "Tiger's Fury %": 35, 'Rip %': 95, 'Rake %': 97 },
        },
      },
    ],
  };
}

describe('buildAnalysisPrompt', () => {
  it('includes boss name and DPS', () => {
    const input: AnalysisResult = {
      input: { characterName: 'Jumbaa', serverSlug: 'ysondre', region: 'EU', difficulty: 5, encounters: [{ id: 3306, name: 'Chimaerus' }] },
      bosses: [makeBoss()],
      generatedAt: '2026-05-09T00:00:00.000Z',
    };

    const prompt = buildAnalysisPrompt(input);
    expect(prompt).toContain('Chimaerus');
    expect(prompt).toContain('250,000');
    expect(prompt).toContain('95.5');
    expect(prompt).toContain("Tiger's Fury");
    expect(prompt).toContain('Rip %');
  });

  it('skips null boss results', () => {
    const input: AnalysisResult = {
      input: { characterName: 'Jumbaa', serverSlug: 'ysondre', region: 'EU', difficulty: 5, encounters: [{ id: 3306, name: 'Chimaerus' }] },
      bosses: [null],
      generatedAt: '2026-05-09T00:00:00.000Z',
    };

    const prompt = buildAnalysisPrompt(input);
    expect(prompt).not.toContain('Chimaerus');
    expect(prompt).toContain('No data');
  });

  it('includes talent diff section', () => {
    const boss = makeBoss();
    const input: AnalysisResult = {
      input: { characterName: 'Jumbaa', serverSlug: 'ysondre', region: 'EU', difficulty: 5, encounters: [{ id: 3306, name: 'Chimaerus' }] },
      bosses: [boss],
      generatedAt: '2026-05-09T00:00:00.000Z',
    };

    const prompt = buildAnalysisPrompt(input);
    expect(prompt).toContain('Talent differences');
  });
});

describe('SYSTEM_PROMPT', () => {
  it('exists and mentions Feral Druid', () => {
    expect(SYSTEM_PROMPT).toContain('Feral Druid');
    expect(SYSTEM_PROMPT).toContain('Tiger');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm test "src/lib/ai/__tests__/prompt"
```
Expected: FAIL — `../prompt` module not found.

- [ ] **Step 3: Create src/lib/ai/prompt.ts**

```ts
import type { AnalysisResult, BossResult, RotationSummary, CharacterStats } from '@/types';

export const SYSTEM_PROMPT = `You are a Feral Druid performance coach analysing WarcraftLogs data. \
Speak directly to the player. Every recommendation must cite specific numbers from the data. \
You know Feral Druid rotation theory: Tiger's Fury alignment with Berserk and openers, \
Rip and Rake uptime targets (95%+), Ferocious Bite only with fresh DoTs, \
Berserk + Tiger's Fury alignment, Convoke the Spirits opener timing. \
Be concise. Lead with the most impactful improvement.`;

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function talentDiff(
  myTalents: Record<number, number>,
  topPlayers: BossResult['topPlayers']
): string {
  if (topPlayers.length === 0) return '';

  const topTalentSets = topPlayers.map((p) => new Set(Object.keys(p.stats.talents)));
  const mySet = new Set(Object.keys(myTalents));

  const topHasAll = (id: string) => topTalentSets.every((s) => s.has(id));
  const topHasAny = (id: string) => topTalentSets.some((s) => s.has(id));

  const onlyMe = [...mySet].filter((id) => !topHasAny(id));
  const onlyTop = topTalentSets
    .flatMap((s) => [...s])
    .filter((id) => !mySet.has(id) && topHasAll(id))
    .filter((id, i, arr) => arr.indexOf(id) === i);

  const lines: string[] = [];
  if (onlyMe.length > 0) lines.push(`You have, top players don't: talent IDs ${onlyMe.join(', ')}`);
  if (onlyTop.length > 0) lines.push(`Top players have, you don't: talent IDs ${onlyTop.join(', ')}`);
  return lines.join('\n') || 'Talent builds are identical.';
}

function rotationTable(
  me: RotationSummary,
  tops: BossResult['topPlayers']
): string {
  const sections: { label: string; key: keyof Pick<RotationSummary, 'cooldowns' | 'generators' | 'finishers'> }[] = [
    { label: 'Cooldowns (casts/min)', key: 'cooldowns' },
    { label: 'Generators (casts/min)', key: 'generators' },
    { label: 'Finishers (casts/min)', key: 'finishers' },
  ];

  return sections.map(({ label, key }) => {
    const abilities = Object.keys(me[key]);
    const header = ['Ability', 'You', ...tops.map((_, i) => `P${i + 1}`)].join(' | ');
    const sep = header.split(' | ').map(() => '---').join(' | ');
    const rows = abilities.map((ab) => {
      const myVal = me[key][ab]?.perMin.toFixed(2) ?? '0';
      const topVals = tops.map((p) => p.rotation[key]?.[ab]?.perMin.toFixed(2) ?? '0');
      return [ab, myVal, ...topVals].join(' | ');
    });
    return `### ${label}\n| ${header} |\n| ${sep} |\n${rows.map((r) => `| ${r} |`).join('\n')}`;
  }).join('\n\n');
}

function statsTable(
  me: CharacterStats & { dps: number; killTime: string },
  tops: BossResult['topPlayers']
): string {
  const stats: { label: string; getValue: (s: CharacterStats & { dps: number; killTime: string }) => string }[] = [
    { label: 'DPS', getValue: (s) => fmt(s.dps) },
    { label: 'Kill time', getValue: (s) => s.killTime },
    { label: 'Avg ilvl', getValue: (s) => s.avgIlvl.toFixed(1) },
    { label: 'Agility', getValue: (s) => fmt(s.agility) },
    { label: 'Crit', getValue: (s) => fmt(s.crit) },
    { label: 'Haste', getValue: (s) => fmt(s.haste) },
    { label: 'Mastery', getValue: (s) => fmt(s.mastery) },
    { label: 'Versatility', getValue: (s) => fmt(s.vers) },
  ];

  const header = ['Stat', 'You', ...tops.map((_, i) => `P${i + 1}`)].join(' | ');
  const sep = header.split(' | ').map(() => '---').join(' | ');
  const rows = stats.map(({ label, getValue }) => {
    const myVal = getValue(me);
    const topVals = tops.map((p) => getValue({ ...p.stats }));
    return [label, myVal, ...topVals].join(' | ');
  });

  return `### Stats\n| ${header} |\n| ${sep} |\n${rows.map((r) => `| ${r} |`).join('\n')}`;
}

function uptimeTable(me: RotationSummary, tops: BossResult['topPlayers']): string {
  const keys = Object.keys(me.uptime);
  const header = ['Buff/Debuff', 'You', ...tops.map((_, i) => `P${i + 1}`)].join(' | ');
  const sep = header.split(' | ').map(() => '---').join(' | ');
  const rows = keys.map((k) => {
    const myVal = `${me.uptime[k]}%`;
    const topVals = tops.map((p) => `${p.rotation.uptime?.[k] ?? 0}%`);
    return [k, myVal, ...topVals].join(' | ');
  });

  return `### Uptime\n| ${header} |\n| ${sep} |\n${rows.map((r) => `| ${r} |`).join('\n')}`;
}

export function buildAnalysisPrompt(result: AnalysisResult): string {
  const bossSections = result.bosses
    .map((boss, i) => {
      const enc = result.input.encounters[i];
      if (!boss) return `## ${enc?.name ?? 'Unknown boss'}\nNo data available for this boss.`;

      const charWithMeta = {
        ...boss.character.stats,
        dps: boss.character.dps,
        killTime: boss.character.killTime,
      };

      return [
        `## ${boss.encounter}`,
        `Kill time: ${boss.character.killTime} | Your DPS: ${fmt(boss.character.dps)} (${boss.character.overallPct}th percentile)`,
        '',
        statsTable(charWithMeta, boss.topPlayers),
        '',
        rotationTable(boss.character.rotation, boss.topPlayers),
        '',
        uptimeTable(boss.character.rotation, boss.topPlayers),
        '',
        '### Talent differences',
        talentDiff(boss.character.stats.talents, boss.topPlayers),
      ].join('\n');
    })
    .join('\n\n---\n\n');

  return [
    `# Feral Druid Performance Analysis — ${result.input.characterName}-${result.input.serverSlug}`,
    '',
    bossSections,
    '',
    '---',
    '',
    'For each boss with data, provide:',
    '1. The single most impactful rotation fix with exact numbers.',
    '2. Any secondary rotation issues (uptime, cast frequency).',
    '3. Stat observations vs top players.',
    '4. Talent notes if differences exist.',
    '5. One thing to focus on next raid.',
    '',
    'Be concise. Cite exact numbers. Skip bosses marked "No data available".',
  ].join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
pnpm test "src/lib/ai/__tests__/prompt"
```
Expected: PASS — 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/prompt.ts src/lib/ai/__tests__/prompt.test.ts
git commit -m "feat: add AI prompt builder with per-boss structured tables"
```

---

### Task 4: ClaudeProvider

**Files:**
- Create: `src/lib/ai/claude.ts`
- Create: `src/lib/ai/__tests__/claude.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/__tests__/claude.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { ClaudeProvider } from '../claude';

vi.mock('@anthropic-ai/sdk', () => {
  const mockStream = {
    [Symbol.asyncIterator]: async function* () {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } };
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'world' } };
      yield { type: 'message_stop' };
    },
  };

  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        stream: vi.fn().mockReturnValue(mockStream),
      },
    })),
  };
});

describe('ClaudeProvider', () => {
  it('streams text chunks from Claude', async () => {
    const provider = new ClaudeProvider('test-api-key');
    const stream = provider.stream('Test prompt', 'System');

    const reader = stream.getReader();
    const chunks: string[] = [];

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    expect(chunks).toEqual(['Hello ', 'world']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm test "src/lib/ai/__tests__/claude"
```
Expected: FAIL — `../claude` module not found.

- [ ] **Step 3: Create src/lib/ai/claude.ts**

```ts
import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider } from './provider';

export class ClaudeProvider implements AIProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  stream(prompt: string, systemPrompt: string): ReadableStream<string> {
    const client = this.client;

    return new ReadableStream<string>({
      async start(controller) {
        const stream = client.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 1500,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }],
        });

        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(event.delta.text);
          }
        }

        controller.close();
      },
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```
pnpm test "src/lib/ai/__tests__/claude"
```
Expected: PASS — 1 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/claude.ts src/lib/ai/__tests__/claude.test.ts
git commit -m "feat: add ClaudeProvider streaming implementation"
```

---

### Task 5: Write ai-report route tests

**Files:**
- Create: `src/app/api/ai-report/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/ai-report/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/ai/claude', () => ({
  ClaudeProvider: vi.fn().mockImplementation(() => ({
    stream: vi.fn().mockReturnValue(
      new ReadableStream<string>({
        start(controller) {
          controller.enqueue('Great rotation ');
          controller.enqueue('analysis here.');
          controller.close();
        },
      })
    ),
  })),
}));

import { POST } from '../route';
import type { AnalysisResult } from '@/types';

const mockResult: AnalysisResult = {
  input: {
    characterName: 'Jumbaa',
    serverSlug: 'ysondre',
    region: 'EU',
    difficulty: 5,
    encounters: [{ id: 3306, name: 'Chimaerus' }],
  },
  bosses: [null],
  generatedAt: '2026-05-09T00:00:00.000Z',
};

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/ai-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/ai-report', () => {
  it('returns SSE stream with text chunks', async () => {
    const req = makeRequest(mockResult, { 'x-ai-key': 'sk-ant-test' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const text = await res.text();
    expect(text).toContain('data: Great rotation ');
    expect(text).toContain('data: analysis here.');
    expect(text).toContain('data: [DONE]');
  });

  it('returns 401 when X-AI-Key header is missing', async () => {
    const req = makeRequest(mockResult);
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when X-AI-Key header is empty', async () => {
    const req = makeRequest(mockResult, { 'x-ai-key': '' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
pnpm test "src/app/api/ai-report"
```
Expected: FAIL — `../route` module not found.

---

### Task 6: Implement the ai-report route

**Files:**
- Create: `src/app/api/ai-report/route.ts`

- [ ] **Step 1: Create src/app/api/ai-report/route.ts**

```ts
import { type NextRequest } from 'next/server';
import { ClaudeProvider } from '@/lib/ai/claude';
import { buildAnalysisPrompt, SYSTEM_PROMPT } from '@/lib/ai/prompt';
import type { AnalysisResult } from '@/types';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  // Never log this header
  const apiKey = req.headers.get('x-ai-key');

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'X-AI-Key header is required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = (await req.json()) as AnalysisResult;
  const provider = new ClaudeProvider(apiKey);
  const prompt = buildAnalysisPrompt(result);
  const chunks = provider.stream(prompt, SYSTEM_PROMPT);

  const sseStream = new TransformStream<string, string>({
    transform(chunk, controller) {
      controller.enqueue(`data: ${chunk}\n\n`);
    },
    flush(controller) {
      controller.enqueue('data: [DONE]\n\n');
    },
  });

  chunks.pipeTo(sseStream.writable).catch(() => {});

  return new Response(sseStream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
```

- [ ] **Step 2: Run tests to verify they pass**

```
pnpm test "src/app/api/ai-report"
```
Expected: PASS — 3 passed.

- [ ] **Step 3: Run typecheck**

```
pnpm typecheck
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ai-report/ src/lib/ai/
git commit -m "feat: add AI report route with Claude SSE streaming"
```

---

### Task 7: Run full suite and push

- [ ] **Step 1: Run all tests**

```
pnpm test
```
Expected: All tests pass (auth, client, parsers, analyze route, prompt, claude, ai-report route + example).

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

- [ ] `pnpm test` — all tests pass including ai-report route (3 tests) and prompt builder (3 tests)
- [ ] `pnpm typecheck` — zero errors
- [ ] Route file `ai-report/route.ts` has `export const runtime = 'edge'`
- [ ] `X-AI-Key` header is NOT logged anywhere in `ai-report/route.ts` (grep: `console.log\|console.error` must not contain `apiKey` or `x-ai-key`)
- [ ] SSE response contains `data: [DONE]` terminator
- [ ] Model is `claude-sonnet-4-6` in `claude.ts`
- [ ] `max_tokens: 1500` in `claude.ts`
