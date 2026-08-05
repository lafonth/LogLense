import type { WorldRanking } from '../references';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CANDIDATE_PAGES, TOP_N } from '../constants';
import { fetchCandidatePool, fetchReferencePlayers, selectReferencePool } from '../references';

function ranking(name: string, duration: number, amount = 250000): WorldRanking {
  return { name, amount, duration, report: { code: `code-${name}`, fightID: 1 } };
}

describe('fetchCandidatePool', () => {
  beforeEach(() => vi.restoreAllMocks());

  function page(n: number, entries: number) {
    return {
      worldData: {
        encounter: {
          characterRankings: {
            rankings: Array.from({ length: entries }, (_, i) => ({
              name: `p${n}-${i}`,
              amount: 100,
              duration: 300000,
              bracketData: 290,
              report: { code: `c${n}-${i}`, fightID: 1 },
            })),
          },
        },
      },
    };
  }

  it('fetches every page and concatenates them', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      return {
        ok: true,
        json: async () => ({ data: page(body.variables.page, 2) }),
      } as Response;
    });

    const pool = await fetchCandidatePool('token', {
      encounterId: 1,
      difficulty: 5,
      specName: 'Feral',
      className: 'Druid',
    });

    expect(pool.pagesFetched).toBe(CANDIDATE_PAGES);
    expect(pool.candidates).toHaveLength(CANDIDATE_PAGES * 2);
  });

  it('drops duplicates that appear on more than one page', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: page(0, 2) }),
    } as Response);

    const pool = await fetchCandidatePool('token', {
      encounterId: 1,
      difficulty: 5,
      specName: 'Feral',
      className: 'Druid',
    });

    // Every page returns the same two entries, so only two survive.
    expect(pool.candidates).toHaveLength(2);
  });

  it('keeps the pages that succeeded when one fails', async () => {
    let call = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      call += 1;
      const thisCall = call;
      if (thisCall === 3) return { ok: false, status: 500 } as Response;
      return { ok: true, json: async () => ({ data: page(thisCall, 1) }) } as Response;
    });

    const pool = await fetchCandidatePool('token', {
      encounterId: 1,
      difficulty: 5,
      specName: 'Feral',
      className: 'Druid',
    });

    expect(pool.pagesFetched).toBe(CANDIDATE_PAGES - 1);
    expect(pool.candidates).toHaveLength(CANDIDATE_PAGES - 1);
  });
});

describe('selectReferencePool', () => {
  const MY_ILVL = 284;
  const MY_MS = 300000;

  function ranking(name: string, bracketData: number, duration: number): WorldRanking {
    return { name, amount: 200000, duration, bracketData, report: { code: name, fightID: 1 } };
  }

  it('prefers the closest candidate over the highest-dps one', () => {
    const all = [
      { ...ranking('strong', 296, 200000), amount: 400000 },
      ranking('close', 285, 305000),
    ];

    expect(selectReferencePool(all, MY_MS, MY_ILVL).map((r) => r.name)).toEqual([
      'close',
      'strong',
    ]);
  });

  it('caps the pool at TOP_N', () => {
    // Built by hand, not via the local `ranking` helper above: the original test's
    // candidates carry no bracketData, and the local helper requires one.
    const inWindow = Array.from({ length: TOP_N + 4 }, (_, i) => ({
      name: `R${i}`,
      amount: 250000,
      duration: MY_MS,
      report: { code: `code-R${i}`, fightID: 1 },
    }));

    expect(selectReferencePool(inWindow, MY_MS, MY_ILVL)).toHaveLength(TOP_N);
  });

  it('returns nothing when there are no rankings at all', () => {
    expect(selectReferencePool([], MY_MS, MY_ILVL)).toEqual([]);
  });

  it('still returns references when none is within tolerance', () => {
    const all = [ranking('far', 320, 120000), ranking('further', 340, 100000)];

    expect(selectReferencePool(all, MY_MS, MY_ILVL).map((r) => r.name)).toEqual(['far', 'further']);
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
