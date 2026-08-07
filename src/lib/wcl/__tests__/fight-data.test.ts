import type { CombatantEvent } from '../combatant';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchFightData } from '../fight-data';

const COMBATANT: CombatantEvent = {
  sourceID: 1,
  specID: 103,
  gear: [
    { itemLevel: 640, id: 1, quality: 4 },
    { itemLevel: 630, id: 2, quality: 4 },
  ],
  agility: 13200,
  critMelee: 3890,
  hasteMelee: 3500,
  mastery: 5800,
  versatilityDamageDone: 750,
  talentTree: [{ id: 391528, rank: 1 }],
};

const DAMAGE_ENTRIES = [
  {
    guid: 1,
    name: 'Rip',
    total: 300,
    targets: [
      { name: 'Boss', total: 240, type: 'NPC' },
      { name: 'Add', total: 60, type: 'NPC' },
    ],
  },
  {
    guid: 2,
    name: 'Ferocious Bite',
    total: 700,
    targets: [
      { name: 'Boss', total: 690, type: 'NPC' },
      { name: 'Mirror', total: 5, type: 'Player' },
      { name: 'Critter', total: 5, type: 'NPC' },
    ],
  },
];

const CASTS = { data: { entries: [{ guid: 1, name: 'Rip', total: 12 }] } };
const BUFFS = {
  data: {
    auras: [
      { guid: 5, name: 'Tiger’s Fury', totalUptime: 30000, totalUses: 5 },
      { guid: 9, name: 'Bloodtalons', totalUptime: 48000, totalUses: 8 },
    ],
  },
};
/** Ce que le joueur applique sur les ennemis — l'essentiel des dégâts d'une spec à DoT. */
const DEBUFFS = {
  data: {
    auras: [
      { guid: 1, name: 'Rip', totalUptime: 54000, totalUses: 12 },
      // Même nom des deux côtés : c'est la même aura, et c'est le buff qui doit l'emporter.
      { guid: 9, name: 'Bloodtalons', totalUptime: 6000, totalUses: 2 },
    ],
  },
};

const CAST_EVENTS = [
  { timestamp: 1000, type: 'cast', abilityGameID: 1 },
  { timestamp: 2500, type: 'cast', abilityGameID: 1 },
];

/** Routes the three parallel queries by looking at the GraphQL body. */
function mockQueries(damageEntries = DAMAGE_ENTRIES) {
  globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
    const body = String(init.body);
    const payload = body.includes('DamageDone')
      ? { reportData: { report: { table: { data: { entries: damageEntries } } } } }
      : body.includes('CastEvents')
        ? { reportData: { report: { events: { data: CAST_EVENTS } } } }
        : { reportData: { report: { casts: CASTS, buffs: BUFFS, debuffs: DEBUFFS } } };

    return { ok: true, json: async () => ({ data: payload }) } as Response;
  });
}

const ARGS = { code: 'abc', fightId: 7, combatant: COMBATANT, name: 'Jumbaa', fightMs: 60000 };

describe('fetchFightData', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('builds stats, rotation and damage entries for the fight', async () => {
    mockQueries();

    const result = await fetchFightData('token', { ...ARGS, dps: 250000 });

    expect(result.stats.name).toBe('Jumbaa');
    expect(result.stats.avgIlvl).toBe(635);
    expect(result.rotation.casts.Rip).toEqual({ guid: 1, casts: 12, perMin: 12 });
    expect(result.rotation.buffs['Tiger’s Fury']).toBe(50);
    expect(result.rotation.fightDurationMs).toBe(60000);
  });

  it('merges the debuffs the player applies into the uptimes', async () => {
    mockQueries();

    const { rotation } = await fetchFightData('token', ARGS);

    // Sans les debuffs, un Rip à 90 % de l'uptime n'existait tout simplement pas.
    expect(rotation.buffs.Rip).toBe(90);
    expect(rotation.buffs['Tiger’s Fury']).toBe(50);
  });

  it('lets the buff win a name collision between the two tables', async () => {
    mockQueries();

    const { rotation } = await fetchFightData('token', ARGS);

    // 48000 ms côté buff contre 6000 côté debuff : c'est la valeur du buff qui sort.
    expect(rotation.buffs.Bloodtalons).toBe(80);
  });

  it('sorts damage entries by total, descending', async () => {
    mockQueries();

    const { damageEntries } = await fetchFightData('token', ARGS);

    expect(damageEntries).toEqual([
      { guid: 2, name: 'Ferocious Bite', total: 700 },
      { guid: 1, name: 'Rip', total: 300 },
    ]);
  });

  it('aggregates fight targets, dropping players and anything under 1%', async () => {
    mockQueries();

    const { fightTargets } = await fetchFightData('token', ARGS);

    // Boss 930/1000, Add 60/1000; Mirror is a Player, Critter is 0.5%
    expect(fightTargets).toEqual([
      { name: 'Boss', type: 'NPC', damagePct: 93 },
      { name: 'Add', type: 'NPC', damagePct: 6 },
    ]);
  });

  it('uses the dps it is given', async () => {
    mockQueries();

    const result = await fetchFightData('token', { ...ARGS, dps: 250000 });

    expect(result.dps).toBe(250000);
    expect(result.rotation.dps).toBe(250000);
  });

  it('derives dps from total damage when none is given', async () => {
    mockQueries();

    const result = await fetchFightData('token', ARGS);

    // (700 + 300) over 60 s
    expect(result.dps).toBe(17);
    expect(result.rotation.dps).toBe(17);
  });

  it('reports zero dps for a zero-length fight rather than dividing by zero', async () => {
    mockQueries();

    const result = await fetchFightData('token', { ...ARGS, fightMs: 0 });

    expect(result.dps).toBe(0);
  });

  it('handles a missing damage table', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const payload = String(init.body).includes('DamageDone')
        ? { reportData: { report: { table: {} } } }
        : { reportData: { report: { casts: CASTS, buffs: BUFFS, debuffs: DEBUFFS } } };
      return { ok: true, json: async () => ({ data: payload }) } as Response;
    });

    const result = await fetchFightData('token', ARGS);

    expect(result.damageEntries).toEqual([]);
    expect(result.fightTargets).toEqual([]);
    expect(result.dps).toBe(0);
  });

  it('reads the opening in order, named from the cast table', async () => {
    mockQueries();

    const result = await fetchFightData('token', ARGS);

    expect(result.rotation.opening).toEqual([
      { guid: 1, name: 'Rip', offsetMs: 0 },
      { guid: 1, name: 'Rip', offsetMs: 1500 },
    ]);
  });

  it('still produces a report when the cast events query fails', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = String(init.body);
      if (body.includes('CastEvents')) throw new Error('rate limited');
      const payload = body.includes('DamageDone')
        ? { reportData: { report: { table: { data: { entries: DAMAGE_ENTRIES } } } } }
        : { reportData: { report: { casts: CASTS, buffs: BUFFS, debuffs: DEBUFFS } } };
      return { ok: true, json: async () => ({ data: payload }) } as Response;
    });

    const result = await fetchFightData('token', ARGS);

    expect(result.rotation.opening).toEqual([]);
    expect(result.rotation.casts.Rip).toEqual({ guid: 1, casts: 12, perMin: 12 });
  });
});
