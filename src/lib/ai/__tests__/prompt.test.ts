import type { AnalysisResult, BossResult, ReferenceSample } from '@/types';
import { describe, expect, it } from 'vitest';
import { buildAnalysisPrompt, SYSTEM_PROMPT } from '../prompt';

/**
 * La fenêtre vérifiée est plus large que les trois références chères : c'est sur elle que
 * se lisent stats et talents. Trois entrées suffisent à donner min, médiane et max distincts.
 */
function sampleEntry(
  name: string,
  avgIlvl: number,
  dps: number,
  talents: Record<number, number>,
  qualified = true
): ReferenceSample {
  return {
    name,
    code: `code-${name}`,
    fightID: 4,
    actorId: 4,
    stats: {
      name,
      avgIlvl,
      primaryStat: 13800,
      crit: 4100,
      haste: 3600,
      mastery: 5900,
      vers: 800,
      talents,
    },
    dps,
    killTimeMs: 175000,
    qualified,
    explored: false,
  };
}

function makeBoss(overrides: Partial<BossResult['character']> = {}): BossResult {
  return {
    renderId: 'render-1',
    encounter: 'Chimaerus',
    encounterId: 3306,
    specId: 103,
    difficulty: 5,
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
        opening: [],
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
      source: { code: 'abc', fightID: 17, actorId: 63 },
      eligibility: { tierPieces: 4, externalUptime: 0, externals: [] },
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
          opening: [],
        },
        damageTable: {
          entries: [
            { name: 'Rip', total: 4000000 },
            { name: 'Rake', total: 2000000 },
            { name: 'Shred', total: 1500000 },
          ],
        },
        provenance: {
          code: 'ref1',
          fightID: 4,
          actorId: 4,
          name: 'TopPlayer1',
          ilvl: 639,
          killTimeMs: 175000,
          dps: 290000,
          distance: 0.42,
          disqualifiedBy: [],
          tierPieces: 4,
          externalUptime: 0,
          explored: false,
        },
      },
    ],
    sample: [
      sampleEntry('TopPlayer1', 639, 290000, { 391528: 1, 395152: 1 }),
      sampleEntry('TopPlayer2', 641, 305000, { 391528: 1, 395152: 1 }),
      sampleEntry('TopPlayer3', 637, 275000, { 391528: 1 }),
    ],
    comparability: {
      level: 'close',
      referenceIlvl: 636,
      myIlvl: 635,
      referenceKillTimeMs: 178000,
      myKillTimeMs: 180000,
      candidatesConsidered: 500,
      pagesFetched: 5,
      disqualified: 0,
      substituted: 0,
    },
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

  it('omits the opening section entirely when no cast order is available', () => {
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

    expect(buildAnalysisPrompt(input)).not.toContain('### Opening');
  });

  it('gives the opening rank by rank and names the first divergence', () => {
    const boss = makeBoss();
    boss.character.rotation.opening = [
      { guid: 5217, name: "Tiger's Fury", offsetMs: 0 },
      { guid: 1079, name: 'Rip', offsetMs: 1500 },
    ];
    boss.topPlayers[0].rotation.opening = [
      { guid: 5217, name: "Tiger's Fury", offsetMs: 0 },
      { guid: 5221, name: 'Shred', offsetMs: 1400 },
    ];

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
    expect(prompt).toContain('### Opening');
    expect(prompt).toContain('+1.5s');
    expect(prompt).toContain('Shred (1/1)');
    expect(prompt).toContain('leaves the reference majority at cast 2');
  });

  it('describes the stats as a distribution and names the size of the field', () => {
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
    expect(prompt).toContain('Field median');
    expect(prompt).toContain('Field = 3 comparable logs');
    // Le partage des effectifs doit être dit : trois logs de rotation ne sont pas une population.
    expect(prompt).toContain('full comparable field (3 logs)');
    expect(prompt).toContain('1 closest of them only');
    // L'adoption d'un talent se compte sur le champ, pas sur les trois références chères.
    expect(prompt).toContain('Field size: 3 comparable logs');
  });

  it('marks the field as unreliable when no log passed the eliminatory criteria', () => {
    const boss = makeBoss();
    boss.sample = boss.sample.map((s) => ({ ...s, qualified: false }));

    const prompt = buildAnalysisPrompt({
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
    });

    expect(prompt).toContain('None of these logs passed the eliminatory criteria');
  });
});

describe('comparability section', () => {
  it('names the level in the prompt', () => {
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
    expect(prompt).toContain('Comparable');
  });

  it('instructs the model not to attribute the gap to the player on a poor comparison', () => {
    const boss = makeBoss();
    boss.comparability = { ...boss.comparability, level: 'poor' };
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
    expect(prompt).toContain('Not comparable');
    expect(prompt).toContain('attribute the DPS gap to the difference in context');
  });

  it('does not add the caution instruction on a close comparison', () => {
    const boss = makeBoss();
    boss.comparability = { ...boss.comparability, level: 'close' };
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
    expect(prompt).not.toContain('attribute the DPS gap to the difference in context');
  });
});

describe('system prompt', () => {
  it('exists and describes the analysis process', () => {
    expect(SYSTEM_PROMPT).toContain('WarcraftLogs');
    expect(SYSTEM_PROMPT).toContain('Fight targets');
    expect(SYSTEM_PROMPT).toContain('Spell Usage');
  });
});
