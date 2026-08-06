import type { EligibilityProfile } from '../eligibility';
import type { WorldRanking } from '../references';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CANDIDATE_PAGES, TOP_N } from '../constants';
import { fetchCandidatePool, resolveReferences } from '../references';

const NO_EXCLUDE = { code: '__none__', fightID: -1 };

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

const CASTS = { data: { entries: [{ guid: 1, name: 'Rip', total: 20 }] } };
const NO_BUFFS = { data: { auras: [] } };
const DAMAGE = {
  data: {
    entries: [
      { guid: 1, name: 'Rip', total: 100 },
      { guid: 2, name: 'Ferocious Bite', total: 900 },
    ],
  },
};

/** Power Infusion held for a fifth of the fight — well past EXTERNAL_TOLERANCE. */
const PI_BUFFS = { data: { auras: [{ guid: 10060, name: 'Power Infusion', totalUptime: 60000 }] } };

function gear(setID?: number) {
  return Array.from({ length: 4 }, () => ({
    itemLevel: 640,
    id: 1,
    quality: 4,
    ...(setID === undefined ? {} : { setID }),
  }));
}

interface FightFixture {
  combatants: unknown[];
  actors: unknown[];
  buffs: unknown;
}

/** One player, named after the report code, wearing no tier and holding no external. */
function plainFight(code: string, over: Partial<FightFixture> = {}): FightFixture {
  return {
    combatants: [{ sourceID: 4, specID: 103, agility: 14000, gear: gear() }],
    actors: [{ id: 4, name: code, type: 'Player' }],
    buffs: NO_BUFFS,
    ...over,
  };
}

/**
 * Answers every WCL query a verification and a fetch make, per report code.
 *
 * The buff table is served from two branches on purpose: the verification stage asks for
 * it alone, the rotation asks for it alongside the casts, and a mock that only knew the
 * second would let a broken verification query pass unnoticed.
 */
function mockFights(fixture: (code: string) => FightFixture = (c) => plainFight(c)) {
  globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
    const body = String(init.body);
    const { variables } = JSON.parse(body) as { variables: { code: string } };
    const fight = fixture(variables.code);

    let payload: unknown;
    if (body.includes('CombatantInfo')) {
      payload = {
        reportData: {
          report: { events: { data: fight.combatants }, masterData: { actors: fight.actors } },
        },
      };
    } else if (body.includes('query Buffs')) {
      payload = { reportData: { report: { buffs: fight.buffs } } };
    } else if (body.includes('DamageDone')) {
      payload = { reportData: { report: { table: DAMAGE } } };
    } else {
      payload = { reportData: { report: { casts: CASTS, buffs: fight.buffs } } };
    }

    return { ok: true, json: async () => ({ data: payload }) } as Response;
  });
}

describe('resolveReferences', () => {
  const MY_ILVL = 284;
  const MY_MS = 300000;

  /** Four tier pieces and no external: the player everything else is measured against. */
  const MINE: EligibilityProfile = { tierPieces: 4, externalUptime: 0, externals: [] };

  beforeEach(() => vi.restoreAllMocks());

  /** The report code is the candidate's name, so the default fixture can identify them. */
  function ranking(name: string, bracketData: number, duration = MY_MS): WorldRanking {
    return { name, amount: 200000, duration, bracketData, report: { code: name, fightID: 1 } };
  }

  function resolve(
    candidates: WorldRanking[],
    over: { exclude?: { code: string; fightID: number }; mine?: EligibilityProfile } = {}
  ) {
    return resolveReferences(
      'token',
      { candidates, pagesFetched: 1 },
      { myIlvl: MY_ILVL, myKillTimeMs: MY_MS, exclude: NO_EXCLUDE, mine: MINE, ...over }
    );
  }

  it('prefers the closest candidate over the highest-dps one', async () => {
    mockFights();

    const { topPlayers } = await resolve([
      { ...ranking('strong', 296, 200000), amount: 400000 },
      ranking('close', 285, 305000),
    ]);

    expect(topPlayers.map((p) => p.provenance.name)).toEqual(['close', 'strong']);
  });

  it('caps the panel at TOP_N, keeping the closest', async () => {
    mockFights();

    // Each candidate sits one ilvl further from the player than the last, so the cap is
    // exercised against a real ordering rather than against insertion order.
    const { topPlayers } = await resolve(
      Array.from({ length: TOP_N + 4 }, (_, i) => ranking(`R${i}`, MY_ILVL + i))
    );

    expect(topPlayers.map((p) => p.provenance.name)).toEqual(
      Array.from({ length: TOP_N }, (_, i) => `R${i}`)
    );
  });

  it('returns nothing when there are no rankings at all', async () => {
    mockFights();

    const { topPlayers, comparability } = await resolve([]);

    expect(topPlayers).toEqual([]);
    expect(comparability.candidatesConsidered).toBe(0);
  });

  it('excludes the player own log even though it scores a perfect zero distance', async () => {
    mockFights();

    const { topPlayers, comparability } = await resolve(
      [ranking('me', MY_ILVL), ranking('near', 285, 305000), ranking('mid', 288, 310000)],
      { exclude: { code: 'me', fightID: 1 } }
    );

    expect(topPlayers.map((p) => p.provenance.name)).not.toContain('me');
    expect(comparability.candidatesConsidered).toBe(2);
  });

  it('keeps a candidate that shares the report code but not the fightID', async () => {
    mockFights(() => ({
      combatants: [
        { sourceID: 4, specID: 103, agility: 14000, gear: gear() },
        { sourceID: 5, specID: 103, agility: 14000, gear: gear() },
      ],
      actors: [
        { id: 4, name: 'me', type: 'Player' },
        { id: 5, name: 'me-other-boss', type: 'Player' },
      ],
      buffs: NO_BUFFS,
    }));

    const shared = (name: string, fightID: number): WorldRanking => ({
      name,
      amount: 200000,
      duration: MY_MS,
      bracketData: MY_ILVL,
      report: { code: 'shared-report', fightID },
    });

    const { topPlayers } = await resolve([shared('me', 1), shared('me-other-boss', 2)], {
      exclude: { code: 'shared-report', fightID: 1 },
    });

    expect(topPlayers.map((p) => p.provenance.name)).toEqual(['me-other-boss']);
  });

  it('reads the named player gear, not the first combatant of the same spec', async () => {
    // Two Ferals in the same raid. Aidan is the one the ranking names, and he is NOT
    // first — matching on spec would return Baldan's gear under Aidan's name.
    mockFights(() => ({
      combatants: [
        { sourceID: 5, specID: 103, agility: 9000, gear: [{ itemLevel: 600, id: 1, quality: 4 }] },
        { sourceID: 4, specID: 103, agility: 14000, gear: [{ itemLevel: 640, id: 1, quality: 4 }] },
      ],
      actors: [
        { id: 4, name: 'Aidan', type: 'Player' },
        { id: 5, name: 'Baldan', type: 'Player' },
      ],
      buffs: NO_BUFFS,
    }));

    const { topPlayers } = await resolve([{ ...ranking('Aidan', 285, 263000), amount: 310000 }]);

    expect(topPlayers[0].stats.avgIlvl).toBe(640);
    expect(topPlayers[0].stats.dps).toBe(310000);
    expect(topPlayers[0].stats.killTime).toBe('4:23');
    expect(topPlayers[0].damageTable.entries).toEqual([
      { name: 'Ferocious Bite', total: 900 },
      { name: 'Rip', total: 100 },
    ]);
  });

  it('carries the provenance the corpus needs, ilvl from the ranking', async () => {
    mockFights((code) => plainFight(code, { buffs: NO_BUFFS }));

    const { topPlayers } = await resolve([{ ...ranking('Aidan', 285, 263000), amount: 310000 }]);

    expect(topPlayers[0].provenance).toMatchObject({
      code: 'Aidan',
      fightID: 1,
      name: 'Aidan',
      // The ranking's bracketData, not stats.avgIlvl (640) — the selection scored on this.
      ilvl: 285,
      killTimeMs: 263000,
      dps: 310000,
      disqualifiedBy: [],
      tierPieces: 0,
      externalUptime: 0,
    });
  });

  it('records a null ilvl when the ranking entry has no bracketData', async () => {
    mockFights();

    const { topPlayers } = await resolve([
      { name: 'Aidan', amount: 310000, duration: 263000, report: { code: 'Aidan', fightID: 1 } },
    ]);

    expect(topPlayers[0].provenance.ilvl).toBeNull();
  });

  it('drops a candidate it cannot identify rather than substituting another player', async () => {
    mockFights(() => plainFight('someone-else'));

    const { topPlayers } = await resolve([ranking('Inconnu', 285)]);

    expect(topPlayers).toEqual([]);
  });

  it('skips candidates with an unusable report reference', async () => {
    mockFights();

    const { topPlayers } = await resolve([
      { name: 'Ghost', amount: 1, duration: 1000, report: { code: '', fightID: 0 } },
    ]);

    expect(topPlayers).toEqual([]);
  });

  it('eliminates a candidate wearing a better set bonus than the player', async () => {
    mockFights((code) => plainFight(code, { combatants: [{ sourceID: 4, gear: gear(1983) }] }));

    const { topPlayers, comparability } = await resolve([ranking('geared', 285)], {
      mine: { tierPieces: 2, externalUptime: 0, externals: [] },
    });

    expect(comparability.disqualified).toBe(1);
    // Completed rather than left empty — but the panel says what it is made of.
    expect(comparability.substituted).toBe(1);
    expect(comparability.level).toBe('poor');
    expect(topPlayers[0].provenance.disqualifiedBy).toEqual(['set-bonus']);
  });

  it('keeps a candidate wearing less tier than the player', async () => {
    mockFights((code) => plainFight(code, { combatants: [{ sourceID: 4, gear: gear() }] }));

    const { topPlayers, comparability } = await resolve([ranking('naked', 285)]);

    // A reference that beat the player with less is exactly the one worth reading.
    expect(topPlayers[0].provenance.disqualifiedBy).toEqual([]);
    expect(comparability.disqualified).toBe(0);
    expect(comparability.substituted).toBe(0);
  });

  it('eliminates a candidate handed an external the player did not have', async () => {
    mockFights((code) => plainFight(code, { buffs: PI_BUFFS }));

    const { topPlayers, comparability } = await resolve([ranking('boosted', 285)]);

    expect(comparability.disqualified).toBe(1);
    expect(topPlayers[0].provenance.disqualifiedBy).toEqual(['external']);
    expect(topPlayers[0].provenance.externalUptime).toBe(20);
  });

  it('prefers a farther qualified candidate over a closer eliminated one', async () => {
    mockFights((code) =>
      code === 'closer'
        ? plainFight(code, { combatants: [{ sourceID: 4, gear: gear(1983) }] })
        : plainFight(code)
    );

    const { topPlayers, comparability } = await resolve(
      [ranking('closer', MY_ILVL), ranking('farther', MY_ILVL + 3)],
      { mine: { tierPieces: 2, externalUptime: 0, externals: [] } }
    );

    // Distance ordered them the other way; the eliminatory criterion overrules it. The
    // eliminated one still completes the panel — behind the qualified one, and marked.
    expect(topPlayers.map((p) => p.provenance.name)).toEqual(['farther', 'closer']);
    expect(topPlayers[0].provenance.disqualifiedBy).toEqual([]);
    expect(topPlayers[1].provenance.disqualifiedBy).toEqual(['set-bonus']);
    expect(comparability.disqualified).toBe(1);
    expect(comparability.substituted).toBe(1);
  });

  it('carries the whole verified window in the sample, marked qualified or not', async () => {
    mockFights((code) =>
      code === 'boosted' ? plainFight(code, { buffs: PI_BUFFS }) : plainFight(code)
    );

    // Quatre candidats pour un panel de trois : le sample doit garder celui que le panel
    // laisse tomber, sans quoi la distribution serait payée puis jetée.
    const { topPlayers, sample } = await resolve([
      ranking('a', MY_ILVL),
      ranking('boosted', MY_ILVL + 1),
      ranking('c', MY_ILVL + 2),
      ranking('d', MY_ILVL + 3),
    ]);

    expect(topPlayers).toHaveLength(3);
    expect(sample.map((s) => s.name)).toEqual(['a', 'boosted', 'c', 'd']);
    expect(sample.map((s) => s.qualified)).toEqual([true, false, true, true]);
    expect(sample[0].stats.avgIlvl).toBe(640);
  });
});
