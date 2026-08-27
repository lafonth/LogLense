import type { ChatPromotion, ChatToolContext } from '../chat-tools';
import type { BossResult, ReferenceSample, TopPlayer } from '@/types';
import { describe, expect, it, vi } from 'vitest';
import { readCohortFilter, runChatTool, subjectKillTimeMs } from '../chat-tools';

function sampleEntry(name: string, over: Partial<ReferenceSample> = {}): ReferenceSample {
  return {
    name,
    code: `code-${name}`,
    fightID: 4,
    actorId: 4,
    stats: {
      name,
      avgIlvl: 639,
      primaryStat: 13800,
      crit: 4100,
      haste: 3600,
      mastery: 5900,
      vers: 800,
      talents: {},
    },
    dps: 290000,
    killTimeMs: 175000,
    qualified: true,
    tierPieces: 2,
    externalUptime: 0,
    explored: false,
    ...over,
  };
}

function topPlayer(name: string): TopPlayer {
  return {
    stats: {
      name,
      avgIlvl: 639,
      primaryStat: 13800,
      crit: 4100,
      haste: 3600,
      mastery: 5900,
      vers: 800,
      dps: 290000,
      killTime: '2:55',
      talents: {},
    },
    rotation: {
      name,
      dps: 290000,
      fightDurationMs: 175000,
      casts: {
        Shred: { guid: 5221, casts: 65, perMin: 22.29 },
        Rip: { guid: 1079, casts: 11, perMin: 3.77 },
      },
      buffs: { "Tiger's Fury": 35 },
      opening: [],
    },
    damageTable: {
      entries: [
        { guid: 1079, name: 'Rip', total: 4000000 },
        { guid: 5221, name: 'Shred', total: 1500000 },
      ],
    },
    fightTargets: [],
    provenance: {
      code: 'ref1',
      fightID: 4,
      actorId: 4,
      name,
      ilvl: 639,
      killTimeMs: 175000,
      dps: 290000,
      distance: 0.42,
      disqualifiedBy: [],
      tierPieces: 4,
      externalUptime: 0,
      explored: false,
    },
  };
}

function makeBoss(): BossResult {
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
        talents: {},
      },
      rotation: {
        name: 'Jumbaa',
        dps: 250000,
        fightDurationMs: 180000,
        casts: {
          Shred: { guid: 5221, casts: 60, perMin: 20 },
          Rip: { guid: 1079, casts: 9, perMin: 3 },
        },
        buffs: { "Tiger's Fury": 28 },
        opening: [],
      },
      damageTable: {
        entries: [
          { guid: 5221, name: 'Shred', total: 5000000 },
          { guid: 1079, name: 'Rip', total: 3000000 },
        ],
      },
      dps: 250000,
      dpsSource: 'ranking',
      bossDps: null,
      killTime: '3:00',
      overallPct: 95.5,
      overallPctOf: 1000,
      todayPct: 92.1,
      bossDpsPct: null,
      bracket: 0,
      trajectory: [],
      source: { code: 'abc', fightID: 17, actorId: 63 },
      eligibility: { tierPieces: 4, externalUptime: 0, externals: [] },
      context: null,
    },
    topPlayers: [topPlayer('TopPlayer1')],
    sample: [
      sampleEntry('TopPlayer1'),
      sampleEntry('Poolboy', {
        dps: 260000,
        stats: { ...sampleEntry('Poolboy').stats, avgIlvl: 636 },
      }),
    ],
    comparability: {
      level: 'close',
      referenceIlvl: 637,
      referenceIlvlCount: 2,
      myIlvl: 635,
      referenceKillTimeMs: 175000,
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
  };
}

function context(over: Partial<ChatToolContext> = {}): ChatToolContext {
  return { boss: makeBoss(), promoted: [], promote: null, ...over };
}

async function call(ctx: ChatToolContext, name: string, input: unknown) {
  const outcome = await runChatTool(ctx, { name, input });
  if (!outcome) throw new Error(`no outcome for ${name}`);
  return { log: outcome.log, body: JSON.parse(outcome.content) as Record<string, unknown> };
}

describe('readCohortFilter', () => {
  it('reads nothing out of a non-object input', () => {
    expect(readCohortFilter('everything')).toEqual({ filter: {}, axes: [] });
    expect(readCohortFilter(undefined)).toEqual({ filter: {}, axes: [] });
  });

  it('converts kill time from the seconds the model speaks to the milliseconds the pool holds', () => {
    expect(readCohortFilter({ minKillTimeSec: 150, maxKillTimeSec: 300 })).toEqual({
      filter: { minKillTimeMs: 150000, maxKillTimeMs: 300000 },
      axes: ['kill-time'],
    });
  });

  it('counts both kill time bounds as a single axis', () => {
    expect(readCohortFilter({ maxKillTimeSec: 300 }).axes).toEqual(['kill-time']);
  });

  it('drops a numeric field the model sent as a string', () => {
    // Un `as CohortFilter` laisserait passer la chaîne, et `'300' <= killTimeMs` retiendrait
    // tout le vivier au lieu de le filtrer : le chat annoncerait un filtre qui n'a rien filtré.
    expect(readCohortFilter({ maxKillTimeSec: '300', ilvlWithin: 'a few' })).toEqual({
      filter: {},
      axes: [],
    });
  });

  it('rounds a tier piece count to a whole number', () => {
    expect(readCohortFilter({ tierPieces: 3.6 }).filter.tierPieces).toBe(4);
  });

  it('records the default of includeDisqualified without calling it an axis', () => {
    // Le champ recopié à sa valeur par défaut n'est pas une demande : au corpus, l'axe doit
    // dire ce que le joueur a réclamé, pas ce que le modèle a rempli.
    expect(readCohortFilter({ includeDisqualified: false })).toEqual({
      filter: { includeDisqualified: false },
      axes: [],
    });
    expect(readCohortFilter({ includeDisqualified: true }).axes).toEqual(['include-disqualified']);
  });

  it('names every axis it was given', () => {
    const { axes } = readCohortFilter({
      tierPieces: 4,
      minKillTimeSec: 150,
      ilvlWithin: 2,
      maxExternalUptime: 5,
      includeDisqualified: true,
    });

    expect(axes).toEqual(['tier-pieces', 'kill-time', 'ilvl', 'externals', 'include-disqualified']);
  });
});

describe('subjectKillTimeMs', () => {
  it('reads back the duration the screen displays', () => {
    const boss = makeBoss();
    expect(subjectKillTimeMs(boss)).toBe(180000);

    boss.character.killTime = '2:55';
    expect(subjectKillTimeMs(boss)).toBe(175000);
  });
});

describe('runChatTool', () => {
  it('returns null on a tool name it does not serve', async () => {
    expect(await runChatTool(context(), { name: 'read_deaths', input: {} })).toBeNull();
  });

  describe('reselect_cohort', () => {
    it('replays the cohort and spends nothing', async () => {
      const { log, body } = await call(context(), 'reselect_cohort', {});

      expect(log).toEqual({
        tool: 'reselect_cohort',
        axes: [],
        declined: null,
        refused: false,
        wclCalls: 0,
      });
      expect(body).toMatchObject({ size: 2, excludedByFilter: 0, comparability: 'close' });
    });

    it('tells the model which members already have a rotation', async () => {
      const { body } = await call(context(), 'reselect_cohort', {});
      const members = body.members as { name: string; hasRotation: boolean }[];

      // Sans ce drapeau, `compare_reference` partirait sur un membre sans rotation pour
      // découvrir qu'il n'en a pas : un aller-retour pour ce que la liste sait déjà.
      expect(members.find((m) => m.name === 'TopPlayer1')?.hasRotation).toBe(true);
      expect(members.find((m) => m.name === 'Poolboy')?.hasRotation).toBe(false);
    });

    it('carries the requested axes to the log', async () => {
      const { log, body } = await call(context(), 'reselect_cohort', { tierPieces: 4 });

      expect(log.axes).toEqual(['tier-pieces']);
      expect(body).toMatchObject({ size: 0, excludedByFilter: 2, comparability: 'none' });
      expect(body.members).toEqual([]);
    });
  });

  describe('compare_reference', () => {
    it('compares against a complete reference, casts and damage included', async () => {
      const { log, body } = await call(context(), 'compare_reference', { name: 'topplayer1' });

      expect(log).toMatchObject({ tool: 'compare_reference', refused: false, wclCalls: 0 });
      expect(body.reference).toMatchObject({ name: 'TopPlayer1', dps: 290000, killTime: '2:55' });
      expect(body.casts).not.toEqual([]);
      expect(body.theirDamage).toEqual([
        { name: 'Rip', total: 4000000 },
        { name: 'Shred', total: 1500000 },
      ]);
    });

    it('refuses a name with no rotation, and says which ones have one', async () => {
      const { log, body } = await call(context(), 'compare_reference', { name: 'Poolboy' });

      expect(log.refused).toBe(true);
      expect(body).toMatchObject({ error: 'no-rotation', complete: ['TopPlayer1'] });
    });

    it('compares against a reference promoted earlier in the conversation', async () => {
      // Une promotion payée au tour trois reste comparable au tour cinq sans être repayée.
      const ctx = context({ promoted: [topPlayer('Latecomer')] });

      const { log, body } = await call(ctx, 'compare_reference', { name: 'Latecomer' });

      expect(log.refused).toBe(false);
      expect(body.reference).toMatchObject({ name: 'Latecomer' });
    });
  });

  describe('promote_reference', () => {
    const granted = (player: TopPlayer): ChatPromotion => ({ ok: true, player, wclCalls: 3 });

    it('refuses without approval, announces the cost, and spends nothing', async () => {
      const promote = vi.fn();
      const ctx = context({ promote });

      const { log, body } = await call(ctx, 'promote_reference', { name: 'Poolboy' });

      expect(promote).not.toHaveBeenCalled();
      expect(body).toMatchObject({ error: 'spend-not-approved', wclCalls: 3 });
      // Les requêtes annoncées ne sont pas des requêtes parties : le corpus compte les
      // secondes, pas les intentions.
      expect(log).toMatchObject({ tool: 'promote_reference', refused: true, wclCalls: 0 });
    });

    it('spends and hands the reference over once approved', async () => {
      const player = topPlayer('Poolboy');
      const promote = vi.fn(async () => granted(player));
      const ctx = context({ promote });

      const { log, body } = await call(ctx, 'promote_reference', {
        name: 'Poolboy',
        spendApproved: true,
      });

      expect(promote).toHaveBeenCalledWith(expect.objectContaining({ name: 'Poolboy' }));
      expect(body).toMatchObject({ promoted: 'Poolboy', wclCalls: 3 });
      expect(log).toMatchObject({ refused: false, wclCalls: 3 });
      // Portée par l'appelant et mutée ici : le tour suivant la trouvera sans repayer.
      expect(ctx.promoted).toEqual([player]);
    });

    it('does not spend on a reference that already has its rotation', async () => {
      const promote = vi.fn();
      const ctx = context({ promote });

      const { log, body } = await call(ctx, 'promote_reference', {
        name: 'TopPlayer1',
        spendApproved: true,
      });

      expect(promote).not.toHaveBeenCalled();
      expect(body).toMatchObject({ error: 'already-complete' });
      expect(log).toMatchObject({ refused: true, wclCalls: 0 });
    });

    it('refuses a name that is not in the verified pool, and lists the pool', async () => {
      const ctx = context({ promote: vi.fn() });

      const { log, body } = await call(ctx, 'promote_reference', {
        name: 'Someone',
        spendApproved: true,
      });

      expect(body).toMatchObject({
        error: 'unknown-candidate',
        candidates: ['TopPlayer1', 'Poolboy'],
      });
      expect(log.refused).toBe(true);
    });

    it('says so instead of pretending when the caller offers no promotion', async () => {
      const { log, body } = await call(context(), 'promote_reference', {
        name: 'Poolboy',
        spendApproved: true,
      });

      expect(body).toMatchObject({ error: 'unavailable' });
      expect(log).toMatchObject({ refused: true, wclCalls: 0 });
    });

    it('passes a refusal from the caller back with its own wording', async () => {
      const ctx = context({ promote: async () => ({ ok: false, reason: 'quota' as const }) });

      const { log, body } = await call(ctx, 'promote_reference', {
        name: 'Poolboy',
        spendApproved: true,
      });

      expect(body.error).toBe('quota');
      expect(body.message).toContain('Nothing was spent');
      expect(log).toMatchObject({ refused: true, wclCalls: 0 });
      expect(ctx.promoted).toEqual([]);
    });

    it('reports a free promotion as free', async () => {
      // Le cache de données de combat peut déjà porter le candidat : la promotion aboutit
      // sans qu'une requête parte, et le corpus doit le lire comme tel.
      const ctx = context({
        promote: async () => ({ ok: true as const, player: topPlayer('Poolboy'), wclCalls: 0 }),
      });

      const { log, body } = await call(ctx, 'promote_reference', {
        name: 'Poolboy',
        spendApproved: true,
      });

      expect(body).toMatchObject({ wclCalls: 0 });
      expect(log).toMatchObject({ refused: false, wclCalls: 0 });
    });
  });

  describe('decline_out_of_scope', () => {
    it('records the declined topic in the closed vocabulary', async () => {
      const { log, body } = await call(context(), 'decline_out_of_scope', { topic: 'defensives' });

      expect(log).toEqual({
        tool: 'decline_out_of_scope',
        axes: [],
        declined: 'defensives',
        refused: true,
        wclCalls: 0,
      });
      expect(body.declined).toBe('defensives');
    });

    it('falls back to other rather than letting a model string into the corpus', async () => {
      const { log } = await call(context(), 'decline_out_of_scope', { topic: 'raid cooldowns' });

      expect(log.declined).toBe('other');
    });
  });
});
