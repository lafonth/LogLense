import type { AnalysisResult, BossResult } from '@/types';
import { describe, expect, it } from 'vitest';
import { buildAnalysisPrompt, SYSTEM_PROMPT } from '../prompt';

function makeBoss(overrides: Partial<BossResult['character']> = {}): BossResult {
  return {
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
        talents: { 391528: 1 },
      },
      rotation: {
        name: 'Jumbaa',
        dps: 250000,
        fightDurationMs: 180000,
        cooldowns: {
          "Tiger's Fury": { casts: 10, perMin: 3.33 },
          Berserk: { casts: 3, perMin: 1 },
          Frenzy: { casts: 2, perMin: 0.67 },
          Convoke: { casts: 2, perMin: 0.67 },
        },
        generators: {
          Shred: { casts: 60, perMin: 20 },
          Swipe: { casts: 5, perMin: 1.67 },
          Moonfire: { casts: 8, perMin: 2.67 },
        },
        finishers: {
          Rip: { casts: 9, perMin: 3 },
          'Ferocious Bite': { casts: 12, perMin: 4 },
          'Primal Wrath': { casts: 0, perMin: 0 },
        },
        uptime: { "Tiger's Fury %": 28, 'Rip %': 88, 'Rake %': 92 },
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
          agility: 13800,
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
          cooldowns: {
            "Tiger's Fury": { casts: 11, perMin: 3.77 },
            Berserk: { casts: 3, perMin: 1.03 },
            Frenzy: { casts: 3, perMin: 1.03 },
            Convoke: { casts: 3, perMin: 1.03 },
          },
          generators: {
            Shred: { casts: 65, perMin: 22.29 },
            Swipe: { casts: 2, perMin: 0.69 },
            Moonfire: { casts: 10, perMin: 3.43 },
          },
          finishers: {
            Rip: { casts: 11, perMin: 3.77 },
            'Ferocious Bite': { casts: 14, perMin: 4.8 },
            'Primal Wrath': { casts: 0, perMin: 0 },
          },
          uptime: { "Tiger's Fury %": 35, 'Rip %': 95, 'Rake %': 97 },
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
      },
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
      },
      bosses: [boss],
      generatedAt: '2026-05-09T00:00:00.000Z',
    };

    const prompt = buildAnalysisPrompt(input);
    expect(prompt).toContain('Talent differences');
  });
});

describe('system prompt', () => {
  it('exists and mentions Feral Druid', () => {
    expect(SYSTEM_PROMPT).toContain('Feral Druid');
    expect(SYSTEM_PROMPT).toContain('Tiger');
  });
});
