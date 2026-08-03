import type { WorldRanking } from '../references';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KILL_TIME_TOLERANCE, TOP_N } from '../constants';
import { fetchReferencePlayers, selectReferencePool } from '../references';

function ranking(name: string, duration: number, amount = 250000): WorldRanking {
  return { name, amount, duration, report: { code: `code-${name}`, fightID: 1 } };
}

describe('selectReferencePool', () => {
  const fightMs = 300000; // 5:00 — window is 4:00 to 6:00 at a 0.2 tolerance

  it('keeps only rankings inside the kill time window', () => {
    const pool = selectReferencePool(
      [ranking('TooFast', 200000), ranking('JustRight', 290000), ranking('TooSlow', 400000)],
      fightMs
    );

    expect(pool.map((r) => r.name)).toEqual(['JustRight']);
  });

  it('includes the exact window bounds', () => {
    const lo = fightMs * (1 - KILL_TIME_TOLERANCE);
    const hi = fightMs * (1 + KILL_TIME_TOLERANCE);

    const pool = selectReferencePool([ranking('Lo', lo), ranking('Hi', hi)], fightMs);

    expect(pool.map((r) => r.name)).toEqual(['Lo', 'Hi']);
  });

  it('caps the pool at TOP_N', () => {
    const inWindow = Array.from({ length: TOP_N + 4 }, (_, i) => ranking(`R${i}`, fightMs));

    expect(selectReferencePool(inWindow, fightMs)).toHaveLength(TOP_N);
  });

  it('falls back to the raw world top when nothing lands in the window', () => {
    const all = [ranking('Fast1', 100000), ranking('Fast2', 110000), ranking('Slow', 900000)];

    const pool = selectReferencePool(all, fightMs);

    expect(pool.map((r) => r.name)).toEqual(['Fast1', 'Fast2', 'Slow'].slice(0, TOP_N));
  });

  it('returns nothing when there are no rankings at all', () => {
    expect(selectReferencePool([], fightMs)).toEqual([]);
  });
});

const COMBATANTS = [
  { sourceID: 4, specID: 103, agility: 14000, gear: [{ itemLevel: 640, id: 1, quality: 4 }] },
  { sourceID: 5, specID: 250, strength: 14000 },
];

const CASTS = { data: { entries: [{ guid: 1, name: 'Rip', total: 20 }] } };
const BUFFS = { data: { auras: [] } };
const DAMAGE = {
  data: {
    entries: [
      { guid: 1, name: 'Rip', total: 100 },
      { guid: 2, name: 'Ferocious Bite', total: 900 },
    ],
  },
};

function mockCandidateQueries(combatants = COMBATANTS) {
  globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
    const body = String(init.body);
    let payload: unknown;

    if (body.includes('CombatantInfo')) {
      payload = { reportData: { report: { events: { data: combatants } } } };
    } else if (body.includes('DamageDone')) {
      payload = { reportData: { report: { table: DAMAGE } } };
    } else {
      payload = { reportData: { report: { casts: CASTS, buffs: BUFFS } } };
    }

    return { ok: true, json: async () => ({ data: payload }) } as Response;
  });
}

describe('fetchReferencePlayers', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('builds a reference player from the ranking and the fight data', async () => {
    mockCandidateQueries();

    const [player] = await fetchReferencePlayers('token', [ranking('Aidan', 263000, 310000)], 103);

    expect(player.stats.name).toBe('Aidan');
    expect(player.stats.dps).toBe(310000);
    expect(player.stats.killTime).toBe('4:23');
    expect(player.stats.avgIlvl).toBe(640);
    expect(player.rotation.dps).toBe(310000);
    expect(player.damageTable.entries).toEqual([
      { name: 'Ferocious Bite', total: 900 },
      { name: 'Rip', total: 100 },
    ]);
  });

  it('skips candidates whose report has no combatant of that spec', async () => {
    mockCandidateQueries();

    const players = await fetchReferencePlayers('token', [ranking('Aidan', 263000)], 577);

    expect(players).toEqual([]);
  });

  it('skips candidates with an unusable report reference', async () => {
    mockCandidateQueries();

    const players = await fetchReferencePlayers(
      'token',
      [{ name: 'Ghost', amount: 1, duration: 1000, report: { code: '', fightID: 0 } }],
      103
    );

    expect(players).toEqual([]);
  });
});
