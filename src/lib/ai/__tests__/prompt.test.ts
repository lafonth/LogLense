import type { AnalysisResult, BossResult } from '@/types';
import { describe, expect, it } from 'vitest';
import { buildAnalysisPrompt, SYSTEM_PROMPT } from '../prompt';

function makeBoss(overrides: Partial<BossResult['character']> = {}): BossResult {
  return {
    encounter: 'Chimaerus',
    encounterId: 3306,
    specId: 103,
    fightTargets: [{ name: 'Chimaerus', type: 'Boss', damagePct: 95.0 }],
    character: {
      stats: {
        name: 'Jumbaa',
        avgIlvl: 635,
        primaryStat: 13200,
        crit: 3890,
        haste: 3500,
        mastery: 5800,
        vers: 750,
        talents: { 391528: 1 },
      },
      rotation: {
        name: 'Jumbaa',
        dps: 250000,
        fightDurationMs: 180000,
        casts: {
          "Tiger's Fury": { casts: 10, perMin: 3.33 },
          Berserk: { casts: 3, perMin: 1 },
          Shred: { casts: 60, perMin: 20 },
          Rip: { casts: 9, perMin: 3 },
          'Ferocious Bite': { casts: 12, perMin: 4 },
        },
        buffs: { "Tiger's Fury": 28 },
      },
      damageTable: {
        entries: [
          { name: 'Shred', total: 5000000 },
          { name: 'Rip', total: 3000000 },
        ],
      },
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
        stats: {
          name: 'TopPlayer1',
          avgIlvl: 639,
          primaryStat: 13800,
          crit: 4100,
          haste: 3600,
          mastery: 5900,
          vers: 800,
          dps: 290000,
          killTime: '2:55',
          talents: { 391528: 1, 395152: 1 },
        },
        rotation: {
          name: 'TopPlayer1',
          dps: 290000,
          fightDurationMs: 175000,
          casts: {
            "Tiger's Fury": { casts: 11, perMin: 3.77 },
            Shred: { casts: 65, perMin: 22.29 },
            Rip: { casts: 11, perMin: 3.77 },
            'Ferocious Bite': { casts: 14, perMin: 4.8 },
          },
          buffs: { "Tiger's Fury": 35 },
        },
        damageTable: {
          entries: [
            { name: 'Rip', total: 4000000 },
            { name: 'Rake', total: 2000000 },
            { name: 'Shred', total: 1500000 },
          ],
        },
      },
    ],
  };
}

describe('buildAnalysisPrompt', () => {
  it('includes boss name and DPS', () => {
    const input: AnalysisResult = {
      input: {
        characterName: 'Jumbaa',
        serverSlug: 'ysondre',
        region: 'EU',
        difficulty: 5,
        encounters: [{ id: 3306, name: 'Chimaerus' }],
        specId: 103,
      },
      bosses: [makeBoss()],
      generatedAt: '2026-05-09T00:00:00.000Z',
    };

    const prompt = buildAnalysisPrompt(input);
    expect(prompt).toContain('Chimaerus');
    expect(prompt).toContain('250,000');
    expect(prompt).toContain('95.5');
    expect(prompt).toContain("Tiger's Fury");
    expect(prompt).toContain('Damage Breakdown');
  });

  it('skips null boss results', () => {
    const input: AnalysisResult = {
      input: {
        characterName: 'Jumbaa',
        serverSlug: 'ysondre',
        region: 'EU',
        difficulty: 5,
        encounters: [{ id: 3306, name: 'Chimaerus' }],
        specId: 103,
      },
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
      input: {
        characterName: 'Jumbaa',
        serverSlug: 'ysondre',
        region: 'EU',
        difficulty: 5,
        encounters: [{ id: 3306, name: 'Chimaerus' }],
        specId: 103,
      },
      bosses: [boss],
      generatedAt: '2026-05-09T00:00:00.000Z',
    };

    const prompt = buildAnalysisPrompt(input);
    expect(prompt).toContain('Talent Differences');
  });
});

describe('system prompt', () => {
  it('exists and describes the analysis process', () => {
    expect(SYSTEM_PROMPT).toContain('WarcraftLogs');
    expect(SYSTEM_PROMPT).toContain('Fight targets');
    expect(SYSTEM_PROMPT).toContain('Spell Usage');
  });
});
