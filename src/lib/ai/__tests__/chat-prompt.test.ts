import type { BossResult } from '@/types';
import { describe, expect, it } from 'vitest';
import { buildChatSystemPrompt, CHAT_PROMPT_VERSION, CHAT_SYSTEM_PROMPT } from '../chat-prompt';
import { CHAT_TOOL_NAMES } from '../chat-tools';
import { SCOPE_RULE, TRACEABILITY_RULE } from '../prompt';

function makeBoss(over: Partial<BossResult> = {}): BossResult {
  return {
    renderId: 'render-1',
    encounter: 'Chimaerus',
    encounterId: 3306,
    specId: 103,
    difficulty: 5,
    fightTargets: [{ name: 'Chimaerus', type: 'Boss', damagePct: 95 }],
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
        casts: { Shred: { guid: 5221, casts: 60, perMin: 20 } },
        buffs: {},
        opening: [],
      },
      damageTable: { entries: [{ guid: 5221, name: 'Shred', total: 5000000 }] },
      dps: 250000,
      dpsSource: 'ranking',
      bossDps: null,
      killTime: '3:00',
      overallPct: 95.5,
      overallPctOf: 1000,
      todayPct: null,
      bossDpsPct: null,
      bracket: 0,
      trajectory: [],
      source: { code: 'abc', fightID: 17, actorId: 63 },
      eligibility: { tierPieces: 4, externalUptime: 0, externals: [] },
      context: null,
    },
    topPlayers: [],
    sample: [],
    comparability: {
      level: 'close',
      referenceIlvl: 636,
      referenceIlvlCount: 3,
      myIlvl: 635,
      referenceKillTimeMs: 178000,
      myKillTimeMs: 180000,
      candidatesConsidered: 500,
      pagesFetched: 5,
      disqualified: 0,
      unverifiable: 0,
      substituted: 0,
      poolDps: null,
      poolIlvl: null,
      poolIlvlCount: 0,
    },
    ...over,
  };
}

describe('chat system prompt', () => {
  it('carries the shared rules rather than a second copy of them', () => {
    // Recopiées, elles dériveraient : le périmètre du produit finirait par dépendre de la
    // porte empruntée, rapport ou chat.
    expect(CHAT_SYSTEM_PROMPT).toContain(TRACEABILITY_RULE);
    expect(CHAT_SYSTEM_PROMPT).toContain(SCOPE_RULE);
  });

  it('names every tool it is given, and no other', () => {
    for (const name of CHAT_TOOL_NAMES) expect(CHAT_SYSTEM_PROMPT).toContain(name);
  });

  it('tells the model to ask before spending, and that spending on its own is refused', () => {
    // C'est la seule consigne dont le non-respect coûte des requêtes au joueur. Elle est
    // doublée par un refus dans `chat-tools.ts` — cette assertion garde la moitié rédigée.
    expect(CHAT_SYSTEM_PROMPT).toContain('spendApproved');
    expect(CHAT_SYSTEM_PROMPT).toMatch(/refused by design/);
  });

  it('is versioned apart from the report prompt', () => {
    expect(CHAT_PROMPT_VERSION).toBe(1);
  });
});

describe('buildChatSystemPrompt', () => {
  it('appends the boss tables after the instructions', () => {
    const prompt = buildChatSystemPrompt(makeBoss());

    expect(prompt.startsWith(CHAT_SYSTEM_PROMPT)).toBe(true);
    expect(prompt).toContain('Chimaerus');
    expect(prompt).toContain('250,000');
    expect(prompt).toContain('Shred');
  });

  it('reads the encounter and the player from the snapshot alone', () => {
    // Le chat n'a que le `BossResult` : pas d'`AnalysisInput`, donc pas de royaume ni de
    // région. Rien de ce qui manque ne doit ressortir dans la chaîne produite.
    const prompt = buildChatSystemPrompt(
      makeBoss({ encounter: 'Vorasius', encounterId: 3177, difficulty: 4 })
    );

    expect(prompt).toContain('Vorasius');
    expect(prompt).toContain('Jumbaa');
    expect(prompt).toContain('Heroic');
    expect(prompt).not.toContain('undefined');
  });

  it('works without a talent tree, which the chat route does not always hold', () => {
    expect(() => buildChatSystemPrompt(makeBoss())).not.toThrow();
  });
});
