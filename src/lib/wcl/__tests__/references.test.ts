import type { EligibilityProfile } from '../eligibility';
import type { Partition } from '../partitions';
import type { WorldRanking } from '../references';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANDIDATE_PAGES,
  PAGES_PER_BRACKET,
  POOL_FLOOR,
  TOP_N,
  VERIFICATION_WINDOW,
} from '../constants';
import { OFFENSIVE_EXTERNALS } from '../eligibility';
import { clearZoneMemo, encounterZoneKey, zoneBracketsKey, zonePartitionsKey } from '../partitions';
import { POOL_TTL_SECONDS, poolCacheKey } from '../pool-cache';
import {
  readCachedVerifications,
  REFERENCE_TTL_SECONDS,
  verificationCacheKey,
} from '../reference-cache';
import { fetchCandidatePool, resolveReferences } from '../references';

const { redisGet, redisMGet, redisSetEx, recordPool } = vi.hoisted(() => ({
  redisGet: vi.fn(),
  redisMGet: vi.fn(),
  redisSetEx: vi.fn(),
  recordPool: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({ redisGet, redisMGet, redisSetEx }));
// La capture du vivier est écrite ici mais testée dans `labels/` : ce fichier vérifie ce qui
// lui est passé, pas ce qui part chez Redis.
vi.mock('@/lib/labels/record-pool', () => ({ recordPool }));

const NO_EXCLUDE = { code: '__none__', fightID: -1 };
const CONTEXT = { encounterId: 1, difficulty: 5, specId: 103 };

const POOL_ARGS = { encounterId: 1, difficulty: 5, specName: 'Feral', className: 'Druid' };

/** La clé du vivier non filtré : celle que tout le monde partageait avant l'étape 6. */
const POOL_KEY_ARGS = { ...POOL_ARGS, bracket: 0, excludeExternals: false };

/** Le découpage d'ilvl relevé sur le palier courant : brackets de 3, à partir de 272. */
const TIER_BRACKETS = { type: 'Item Level', min: 272, max: 344, bucket: 3 };

/** Le vivier tel qu'il repart de `fetchCandidatePool` quand rien n'a été filtré. */
const UNFILTERED_FILTERS = { brackets: [], externalBuffs: 'Any' as const, relaxed: false };

describe('fetchCandidatePool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    redisGet.mockResolvedValue(null);
    redisSetEx.mockResolvedValue(undefined);
    // L'état de module survit d'un cas au suivant : sans cet oubli, un palier appris ici
    // servirait au cas d'après et rendrait les assertions dépendantes de leur ordre.
    clearZoneMemo();
  });

  /** Deux partitions d'une même saison : le vivier s'éclate sur les deux. */
  const SEASON: Partition[] = [
    { id: 1, name: '12.0', default: false },
    { id: 2, name: '12.0.5', default: true },
  ];
  const SEASON_PAGES = SEASON.length * CANDIDATE_PAGES;

  /**
   * Une page de classement. La clé porte la partition autant que le rang de page : deux
   * partitions qui rendraient les mêmes entrées se feraient dédoublonner, et l'éclatement
   * passerait inaperçu.
   */
  function page(key: string | number, entries: number) {
    return {
      worldData: {
        encounter: {
          characterRankings: {
            rankings: Array.from({ length: entries }, (_, i) => ({
              name: `p${key}-${i}`,
              amount: 100,
              duration: 300000,
              bracketData: 290,
              report: { code: `c${key}-${i}`, fightID: 1 },
            })),
          },
        },
      },
    };
  }

  /** Une page qui échoue à toutes les tentatives, sans demander de délai particulier. */
  function failedPage() {
    return { ok: false, status: 500, headers: { get: () => null } } as unknown as Response;
  }

  const ok = (data: unknown) => ({ ok: true, json: async () => ({ data }) }) as Response;

  /**
   * Aiguille sur le nom de la requête, pas sur ses variables : la résolution des partitions
   * n'a pas de `page`, et la traiter comme une page de classement rendrait vert un mock qui
   * ne répond pas à ce qu'on lui demande.
   */
  function mockWcl(
    rankings: (vars: RankingVars) => Response | Promise<Response>,
    partitions: Partition[] | null = SEASON,
    brackets: unknown = null
  ) {
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (String(body.query).includes('EncounterPartitions')) {
        if (partitions === null) return failedPage();
        return ok({ worldData: { encounter: { zone: { id: 46, partitions, brackets } } } });
      }
      return rankings(body.variables);
    });
  }

  /** Les variables d'une page de classement, filtres compris. */
  interface RankingVars {
    page: number;
    partition?: number;
    bracket: number;
    externalBuffs: 'Any' | 'Exclude';
  }

  /** Les variables de chaque requête de classement réellement partie. */
  function rankingVars(): RankingVars[] {
    return vi
      .mocked(globalThis.fetch)
      .mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)))
      .filter((b) => !String(b.query).includes('EncounterPartitions'))
      .map((b) => b.variables as RankingVars);
  }

  it('fetches every page of every partition of the season', async () => {
    mockWcl(({ page: n, partition }) => ok(page(`${partition}-${n}`, 2)));

    const pool = await fetchCandidatePool('token', POOL_ARGS);

    expect(pool.pagesExpected).toBe(SEASON_PAGES);
    expect(pool.pagesFetched).toBe(SEASON_PAGES);
    expect(pool.candidates).toHaveLength(SEASON_PAGES * 2);
  });

  // Le repli : l'analyse aboutit sur le vivier par défaut plutôt que d'échouer, même s'il est
  // pauvre. C'est la seule voie qui reste à `Q_WORLD_RANKINGS`.
  it('queries without a partition when the season cannot be resolved', async () => {
    mockWcl(({ page: n }) => ok(page(n, 2)), null);

    const pool = await fetchCandidatePool('token', POOL_ARGS);

    expect(pool.pagesExpected).toBe(CANDIDATE_PAGES);
    expect(pool.pagesFetched).toBe(CANDIDATE_PAGES);

    const calls = rankingVars();
    expect(calls).toHaveLength(CANDIDATE_PAGES);
    expect(calls.every((v) => v.partition === undefined)).toBe(true);
  });

  it('drops duplicates that appear on more than one page', async () => {
    mockWcl(() => ok(page(0, 2)));

    const pool = await fetchCandidatePool('token', POOL_ARGS);

    // Toutes les pages de toutes les partitions rendent les deux mêmes entrées.
    expect(pool.candidates).toHaveLength(2);
  });

  it('keeps the pages that succeeded when one fails', async () => {
    mockWcl(({ page: n, partition }) => {
      // La panne suit la page, pas le rang de l'appel : `gql` reprend, et une page qui
      // n'échouerait qu'une fois reviendrait à la tentative suivante — le scénario testé
      // ici, celui d'une page réellement perdue, ne se produirait jamais.
      if (partition === 1 && n === 3) return failedPage();
      return ok(page(`${partition}-${n}`, 1));
    });

    const pool = await fetchCandidatePool('token', POOL_ARGS);

    expect(pool.pagesFetched).toBe(SEASON_PAGES - 1);
    expect(pool.candidates).toHaveLength(SEASON_PAGES - 1);
  });

  // La raison d'être du cache : ces pages sont le gros de la facture WCL d'une analyse.
  //
  // Le palier est en cache lui aussi, et il doit l'être : depuis que la clé du vivier porte le
  // bracket, on ne peut plus la former sans savoir comment le palier découpe l'ilvl. Un cache
  // chaud reste donc à zéro requête — mais il lui faut ses deux entrées, pas une.
  it('serves a cached pool without touching Warcraft Logs', async () => {
    const cached = {
      candidates: [{ name: 'p', report: { code: 'x', fightID: 1 } }],
      pagesFetched: 4,
      pagesExpected: 4,
    };
    clearZoneMemo();
    redisGet.mockImplementation(async (key: string) => {
      if (key === encounterZoneKey(POOL_ARGS.encounterId)) return '46';
      if (key === zonePartitionsKey(46)) return JSON.stringify([1, 2]);
      if (key === zoneBracketsKey(46)) return 'null';
      if (key === poolCacheKey(POOL_KEY_ARGS)) return JSON.stringify(cached);
      return null;
    });
    globalThis.fetch = vi.fn();

    const pool = await fetchCandidatePool('token', POOL_ARGS);

    expect(pool).toEqual({ ...cached, filters: UNFILTERED_FILTERS });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(redisGet).toHaveBeenCalledWith(poolCacheKey(POOL_KEY_ARGS));
  });

  // Le TTL est la garantie vis-à-vis du §5d : une copie sans expiration serait la base de
  // données permanente que les CGU refusent. Il est donc vérifié, pas seulement documenté.
  it('writes a complete pool with an explicit expiry', async () => {
    mockWcl(({ page: n, partition }) => ok(page(`${partition}-${n}`, 2)));

    await fetchCandidatePool('token', POOL_ARGS);

    expect(redisSetEx).toHaveBeenCalledWith(
      poolCacheKey(POOL_KEY_ARGS),
      expect.any(String),
      POOL_TTL_SECONDS
    );
  });

  // Une page perdue est un incident réseau ; l'écrire la figerait six heures pour toute la
  // spec. La complétude se juge maintenant sur `pagesExpected`, qui dépend du nombre de
  // partitions — une constante ne pourrait plus la décrire.
  it('does not cache a pool that lost a page of one partition', async () => {
    mockWcl(({ page: n, partition }) => {
      if (partition === 2 && n === 3) return failedPage();
      return ok(page(`${partition}-${n}`, 1));
    });

    const pool = await fetchCandidatePool('token', POOL_ARGS);

    expect(pool.pagesFetched).toBeLessThan(pool.pagesExpected);
    // Nommer la clé, et pas seulement le spy : la résolution des partitions écrit son propre
    // cache par le même `redisSetEx`, et un `not.toHaveBeenCalled` nu confondrait les deux.
    expect(redisSetEx).not.toHaveBeenCalledWith(
      poolCacheKey(POOL_KEY_ARGS),
      expect.anything(),
      expect.anything()
    );
  });

  // Échoue ouvert, à l'inverse du quota : un cache muet coûte des requêtes, il ne doit pas
  // coûter l'analyse.
  it('falls back to a live fetch when Redis is down', async () => {
    redisGet.mockRejectedValue(new Error('upstash down'));
    redisSetEx.mockRejectedValue(new Error('upstash down'));
    mockWcl(() => ok(page(0, 2)));

    const pool = await fetchCandidatePool('token', POOL_ARGS);

    expect(pool.pagesFetched).toBe(SEASON_PAGES);
    expect(pool.candidates).toHaveLength(2);
  });

  // Le filtre d'ilvl, et la raison d'être de l'étape : le vivier obtenu tient dans la
  // tolérance au lieu de la croiser, à budget de requêtes comparable.
  it('asks Warcraft Logs for the brackets covering the tolerance, and for nothing else', async () => {
    mockWcl((v) => ok(page(`${v.bracket}-${v.partition}-${v.page}`, 2)), SEASON, TIER_BRACKETS);

    const pool = await fetchCandidatePool('token', { ...POOL_ARGS, myIlvl: 320 });

    expect(pool.filters.brackets).toEqual([15, 16, 17, 18]);
    expect(pool.filters.relaxed).toBe(false);

    const calls = rankingVars();
    expect([...new Set(calls.map((v) => v.bracket))].sort((a, b) => a - b)).toEqual([
      15, 16, 17, 18,
    ]);
    // Trois pages par bracket et par partition : plus étroit que dix pages non filtrées, et
    // pourtant plus dense — une tranche de 3 ilvl remplit ses pages.
    expect(calls).toHaveLength(4 * SEASON.length * PAGES_PER_BRACKET);
    expect(calls.every((v) => v.page <= PAGES_PER_BRACKET)).toBe(true);
  });

  // Le repli : un palier qui ne découpe pas sur l'ilvl rend le vivier d'avant l'étape, et les
  // deux arguments partent quand même avec leur valeur neutre explicite.
  it('passes the neutral filter values when the tier declares no ilvl bracketing', async () => {
    mockWcl((v) => ok(page(v.page, 2)), SEASON, null);

    const pool = await fetchCandidatePool('token', { ...POOL_ARGS, myIlvl: 320 });

    expect(pool.filters).toEqual(UNFILTERED_FILTERS);
    expect(rankingVars().every((v) => v.bracket === 0 && v.externalBuffs === 'Any')).toBe(true);
    expect(rankingVars()).toHaveLength(SEASON_PAGES);
  });

  it('does not filter on ilvl when the subject ilvl is unknown', async () => {
    mockWcl((v) => ok(page(v.page, 2)), SEASON, TIER_BRACKETS);

    const pool = await fetchCandidatePool('token', POOL_ARGS);

    expect(pool.filters.brackets).toEqual([]);
    expect(rankingVars().every((v) => v.bracket === 0)).toBe(true);
  });

  // Conditionnel, et c'est tout l'enjeu : pour un joueur qui reçoit Power Infusion à chaque
  // pull, exclure les porteurs supprimerait précisément ses bonnes comparaisons.
  it('arms the external filter only for a player who carries none', async () => {
    mockWcl((v) => ok(page(v.page, 2)));
    await fetchCandidatePool('token', { ...POOL_ARGS, excludeExternals: true });
    expect(rankingVars().every((v) => v.externalBuffs === 'Exclude')).toBe(true);

    mockWcl((v) => ok(page(v.page, 2)));
    const pool = await fetchCandidatePool('token', { ...POOL_ARGS, excludeExternals: false });
    expect(rankingVars().every((v) => v.externalBuffs === 'Any')).toBe(true);
    expect(pool.filters.externalBuffs).toBe('Any');
  });

  it('keeps a populous filtered pool without paying for the unfiltered one', async () => {
    mockWcl((v) => ok(page(`${v.bracket}-${v.partition}-${v.page}`, 2)), SEASON, TIER_BRACKETS);

    const pool = await fetchCandidatePool('token', { ...POOL_ARGS, myIlvl: 320 });

    expect(pool.candidates.length).toBeGreaterThanOrEqual(POOL_FLOOR);
    expect(pool.filters.relaxed).toBe(false);
    expect(rankingVars().some((v) => v.bracket === 0)).toBe(false);
  });

  // Filtrer peut vider. Sous le plancher, le vivier non filtré est ajouté — et `relaxed` le
  // dit, parce qu'un vivier élargi en silence n'est plus celui que la bannière décrit.
  it('widens a filtered pool that fell under the floor, and reports that it did', async () => {
    // Toutes les tranches rendent la même entrée : le dédoublonnage laisse un vivier d'un.
    mockWcl(
      (v) => (v.bracket === 0 ? ok(page(`u-${v.partition}-${v.page}`, 2)) : ok(page('same', 1))),
      SEASON,
      TIER_BRACKETS
    );

    const pool = await fetchCandidatePool('token', { ...POOL_ARGS, myIlvl: 320 });

    expect(pool.filters.relaxed).toBe(true);
    // Les brackets restent nommés : c'est avec eux que le vivier a d'abord été demandé.
    expect(pool.filters.brackets).toEqual([15, 16, 17, 18]);
    expect(pool.candidates.length).toBeGreaterThan(POOL_FLOOR);
    expect(rankingVars().filter((v) => v.bracket === 0)).toHaveLength(SEASON_PAGES);
  });

  it('deduplicates a candidate that two neighbouring brackets both returned', async () => {
    mockWcl(() => ok(page('shared', 3)), SEASON, TIER_BRACKETS);

    const pool = await fetchCandidatePool('token', { ...POOL_ARGS, myIlvl: 320 });

    expect(pool.candidates).toHaveLength(3);
  });

  it('gives two specs of the same boss different cache keys', () => {
    expect(poolCacheKey(POOL_KEY_ARGS)).not.toBe(
      poolCacheKey({ ...POOL_KEY_ARGS, specName: 'Balance' })
    );
    expect(poolCacheKey(POOL_KEY_ARGS)).not.toBe(poolCacheKey({ ...POOL_KEY_ARGS, difficulty: 4 }));
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
    } else if (body.includes('CastEvents')) {
      payload = { reportData: { report: { events: { data: [] } } } };
    } else if (body.includes('DamageDone')) {
      payload = { reportData: { report: { table: DAMAGE } } };
    } else {
      // La référence passe par le même `fetchFightData` : elle demande donc aussi ses
      // debuffs. Aucun de ces cas ne porte sur l'uptime — une table vide suffit.
      payload = { reportData: { report: { casts: CASTS, buffs: fight.buffs, debuffs: NO_BUFFS } } };
    }

    return { ok: true, json: async () => ({ data: payload }) } as Response;
  });
}

describe('resolveReferences', () => {
  const MY_ILVL = 284;
  const MY_MS = 300000;

  /** Four tier pieces and no external: the player everything else is measured against. */
  const MINE: EligibilityProfile = { tierPieces: 4, externalUptime: 0, externals: [] };

  beforeEach(() => {
    vi.restoreAllMocks();
    // Cache froid par défaut : chaque test qui veut un cache chaud le dit lui-même.
    redisGet.mockResolvedValue(null);
    redisMGet.mockImplementation((keys: string[]) => Promise.resolve(keys.map(() => null)));
    redisSetEx.mockResolvedValue(undefined);
  });

  /** The report code is the candidate's name, so the default fixture can identify them. */
  function ranking(name: string, bracketData: number, duration = MY_MS): WorldRanking {
    return { name, amount: 200000, duration, bracketData, report: { code: name, fightID: 1 } };
  }

  function resolve(
    candidates: WorldRanking[],
    over: {
      exclude?: { code: string; fightID: number };
      mine?: EligibilityProfile;
      random?: () => number;
    } = {}
  ) {
    return resolveReferences(
      'token',
      { candidates, pagesFetched: 1, pagesExpected: 1, filters: UNFILTERED_FILTERS },
      {
        myIlvl: MY_ILVL,
        myKillTimeMs: MY_MS,
        exclude: NO_EXCLUDE,
        mine: MINE,
        context: CONTEXT,
        // La fente d'exploration est neutralisée par défaut : un panel tiré au sort rendrait
        // les autres cas non déterministes, et ce n'est pas eux qu'elle doit exercer.
        random: () => 1,
        ...over,
      }
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

  // Le vivier est écrit d'ici et de nulle part ailleurs : c'est le seul point qui connaisse
  // les écartés. Les remonter jusqu'à la route mettrait des pointeurs tiers dans la réponse.
  it('captures the whole pool, écartés included, with their motive', async () => {
    mockFights();
    recordPool.mockClear();

    await resolve(Array.from({ length: TOP_N + 2 }, (_, i) => ranking(`R${i}`, MY_ILVL + i)));

    expect(recordPool).toHaveBeenCalledTimes(1);
    const [observations, context] = recordPool.mock.calls[0] as [
      Array<{ code: string; shown: boolean; verified: boolean }>,
      { encounterId: number; subject: { code: string; ilvl: number } },
    ];

    expect(observations.map((o) => o.code)).toEqual(
      Array.from({ length: TOP_N + 2 }, (_, i) => `R${i}`)
    );
    expect(observations.filter((o) => o.shown)).toHaveLength(TOP_N);
    expect(observations.every((o) => o.verified)).toBe(true);
    expect(context).toMatchObject({
      ...CONTEXT,
      subject: { ...NO_EXCLUDE, ilvl: MY_ILVL, killTimeMs: MY_MS },
    });
  });

  // Un candidat que la vérification n'a pas pu lire reste dans le vivier : son absence de
  // profil est elle-même une observation, et la taire biaiserait le corpus vers le lisible.
  it('captures the candidates the verification could not read', async () => {
    mockFights((code) =>
      code === 'ghost' ? { combatants: [], actors: [], buffs: NO_BUFFS } : plainFight(code)
    );
    recordPool.mockClear();

    await resolve([ranking('ghost', 284), ranking('near', 285)]);

    const [observations] = recordPool.mock.calls[0] as [
      Array<{ code: string; verified: boolean; actorId: number | null }>,
    ];
    expect(observations.map((o) => [o.code, o.verified, o.actorId])).toEqual([
      ['ghost', false, null],
      ['near', true, 4],
    ]);
  });

  // Un rapport privé retirait un candidat du panel sans laisser de trace : la bannière
  // annonçait alors un panel court sans rien qui distingue l'incident du verdict.
  it('counts the candidates the verification could not read', async () => {
    mockFights((code) =>
      code === 'ghost' ? { combatants: [], actors: [], buffs: NO_BUFFS } : plainFight(code)
    );

    const { topPlayers, comparability } = await resolve([
      ranking('ghost', 284),
      ranking('near', 285),
    ]);

    expect(topPlayers.map((p) => p.provenance.name)).toEqual(['near']);
    expect(comparability.unverifiable).toBe(1);
    expect(comparability.disqualified).toBe(0);
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
      { guid: 2, name: 'Ferocious Bite', total: 900 },
      { guid: 1, name: 'Rip', total: 100 },
    ]);
  });

  it('carries the provenance the corpus needs, ilvl from the ranking', async () => {
    mockFights((code) => plainFight(code, { buffs: NO_BUFFS }));

    const { topPlayers } = await resolve([{ ...ranking('Aidan', 285, 263000), amount: 310000 }]);

    expect(topPlayers[0].provenance).toMatchObject({
      code: 'Aidan',
      fightID: 1,
      // Le pointeur de réhydratation : sans lui il faudrait garder le nom pour retrouver
      // l'acteur, c'est-à-dire garder ce que le corpus doit justement pouvoir jeter.
      actorId: 4,
      name: 'Aidan',
      // The ranking's bracketData, not stats.avgIlvl (640) — the selection scored on this.
      ilvl: 285,
      killTimeMs: 263000,
      dps: 310000,
      disqualifiedBy: [],
      tierPieces: 0,
      externalUptime: 0,
      // Sélectionnée par la règle de distance, pas tirée : c'est ce que le corpus doit
      // pouvoir distinguer, et la valeur par défaut ne doit donc pas être implicite.
      explored: false,
    });
  });

  // La clause de sortie de l'étape 6, vue de bout en bout : un vivier resserré peut rendre un
  // panel plus court que `TOP_N`, et le niveau doit le dire — même quand chaque référence
  // retenue est, elle, toute proche.
  it('never announces a panel shorter than TOP_N as comparable, however close it is', async () => {
    mockFights();

    const { topPlayers, comparability } = await resolve([
      ranking('near', MY_ILVL),
      ranking('alsonear', MY_ILVL + 1),
    ]);

    expect(topPlayers).toHaveLength(2);
    expect(comparability.disqualified).toBe(0);
    expect(comparability.substituted).toBe(0);
    expect(comparability.level).toBe('poor');
  });

  it('leaves a full panel of close references at close', async () => {
    mockFights();

    const { comparability } = await resolve(
      Array.from({ length: TOP_N }, (_, i) => ranking(`R${i}`, MY_ILVL + i))
    );

    expect(comparability.level).toBe('close');
  });

  // Rendu et non déductible : la couverture peut être abandonnée faute de découpage, et le
  // plancher peut la relâcher après coup. Un écran qui la recalculerait décrirait un vivier
  // que personne n'a interrogé.
  it('carries the pool filters through to the banner', async () => {
    mockFights();

    const { comparability } = await resolveReferences(
      'token',
      {
        candidates: [ranking('near', MY_ILVL)],
        pagesFetched: 1,
        pagesExpected: 1,
        filters: { brackets: [15, 16, 17], externalBuffs: 'Exclude', relaxed: true },
      },
      {
        myIlvl: MY_ILVL,
        myKillTimeMs: MY_MS,
        exclude: NO_EXCLUDE,
        mine: MINE,
        context: CONTEXT,
        random: () => 1,
      }
    );

    expect(comparability.poolFilters).toEqual({
      brackets: [15, 16, 17],
      externalBuffs: 'Exclude',
      relaxed: true,
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
    // Chaque entrée porte son pointeur : le corpus doit pouvoir la retrouver sans son nom.
    expect(sample.map((s) => s.actorId)).toEqual([4, 4, 4, 4]);
    expect(sample[0].stats.avgIlvl).toBe(640);
  });

  /**
   * Une référence dont les données de combat ne se chargent pas ne doit pas emporter
   * l'analyse entière : sous `Promise.all` un seul rejet rendait zéro référence, donc un
   * rapport vide pour un incident survenu sur le rapport d'un tiers. Ce qui reste est rendu,
   * et les compteurs décrivent le panel réellement affiché — la référence perdue sort aussi
   * de `references`, donc du vivier marqué « montré ».
   */
  it('renders the other references when one fails to build', async () => {
    mockFights();
    recordPool.mockClear();

    // Le rapport passe la vérification puis devient illisible : c'est l'ordre réel d'un log
    // repassé en privé entre les deux requêtes.
    const answer = globalThis.fetch as unknown as (u: string, i: RequestInit) => Promise<Response>;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      const body = String(init.body);
      const { variables } = JSON.parse(body) as { variables: { code: string } };
      if (variables.code === 'broken' && body.includes('DamageDone')) {
        return {
          ok: true,
          json: async () => ({ errors: [{ message: 'You do not have permission' }] }),
        } as Response;
      }
      return answer(url, init);
    });

    const { topPlayers, comparability } = await resolve([
      ranking('near', MY_ILVL),
      ranking('broken', MY_ILVL + 1),
      ranking('far', MY_ILVL + 2),
    ]);

    expect(topPlayers).toHaveLength(2);
    expect(topPlayers.map((p) => p.provenance.name)).toEqual(['near', 'far']);
    expect(comparability.substituted).toBe(0);

    const [observations] = recordPool.mock.calls[0] as [Array<{ code: string; shown: boolean }>];
    expect(observations.filter((o) => o.shown).map((o) => o.code)).toEqual(['near', 'far']);
  });

  describe('exploration slot', () => {
    /** Un tirage scripté : le premier nombre ouvre la fente, le second choisit le candidat. */
    function draws(...values: number[]): () => number {
      let i = 0;
      return () => values[Math.min(i++, values.length - 1)];
    }

    /** Plus d'un vivier de vérification, chacun un ilvl plus loin que le précédent. */
    const POOL = Array.from({ length: VERIFICATION_WINDOW + 2 }, (_, i) =>
      ranking(`R${i}`, MY_ILVL + i)
    );

    it('gives the last panel slot to a candidate drawn from outside the window', async () => {
      mockFights();

      // 0.05 < EXPLORATION_RATE ouvre la fente ; 0 prend le premier hors fenêtre, R12.
      const { topPlayers } = await resolve(POOL, { random: draws(0.05, 0) });

      // R2 perd sa place : le panel garde sa taille, il n'est pas élargi pour cacher le coût.
      expect(topPlayers.map((p) => p.provenance.name)).toEqual(['R0', 'R1', 'R12']);
      expect(topPlayers.map((p) => p.provenance.explored)).toEqual([false, false, true]);
    });

    it('leaves the panel to the selection when the draw does not fire', async () => {
      mockFights();

      const { topPlayers } = await resolve(POOL, { random: draws(0.5) });

      expect(topPlayers.map((p) => p.provenance.name)).toEqual(['R0', 'R1', 'R2']);
      expect(topPlayers.every((p) => !p.provenance.explored)).toBe(true);
    });

    it('marks the explored candidate in the sample, where training reads it', async () => {
      mockFights();

      const { sample } = await resolve(POOL, { random: draws(0.05, 0) });

      // Toute la fenêtre plus le tiré : c'est la seule entrée dont la présence ne s'explique
      // pas par la distance, et la confondre avec les autres apprendrait le biais du sélecteur.
      expect(sample).toHaveLength(VERIFICATION_WINDOW + 1);
      expect(sample.filter((s) => s.explored).map((s) => s.name)).toEqual(['R12']);
    });

    it('does not seat an explored candidate that an eliminatory criterion refuses', async () => {
      mockFights((code) =>
        code === 'R12'
          ? plainFight(code, {
              combatants: [{ sourceID: 4, specID: 103, agility: 14000, gear: gear(1983) }],
            })
          : plainFight(code)
      );

      const { topPlayers, sample } = await resolve(POOL, {
        mine: { tierPieces: 2, externalUptime: 0, externals: [] },
        random: draws(0.05, 0),
      });

      // La fente sert à montrer un candidat que la distance écarte, pas à contourner les
      // critères éliminatoires : le rang revient à la sélection, entier.
      expect(topPlayers.map((p) => p.provenance.name)).toEqual(['R0', 'R1', 'R2']);
      // Vérifié et jugé quand même : le refus est de l'information, il part au corpus.
      expect(sample.filter((s) => s.explored)).toMatchObject([{ name: 'R12', qualified: false }]);
    });

    it('never draws a candidate the selection could not score', async () => {
      mockFights();

      // Hors fenêtre, tous sans bracketData : `Infinity` dit « pas jugeable », pas « loin ».
      // Explorer là-dessus testerait l'absence de mesure, pas l'hypothèse de la fente.
      const unscorable = Array.from({ length: 2 }, (_, i) => ({
        name: `U${i}`,
        amount: 200000,
        duration: MY_MS,
        report: { code: `U${i}`, fightID: 1 },
      }));

      const { topPlayers } = await resolve([...POOL.slice(0, VERIFICATION_WINDOW), ...unscorable], {
        random: draws(0.05, 0),
      });

      expect(topPlayers.map((p) => p.provenance.name)).toEqual(['R0', 'R1', 'R2']);
    });
  });

  describe('reference caches', () => {
    /**
     * Une table de buffs qui a répondu, et qui ne porte aucun external : un flask, rien de
     * plus. `NO_BUFFS` ne convient pas ici — une table vide est justement ce que le garde de
     * complétude refuse d'écrire, faute de pouvoir la distinguer d'une requête sans réponse.
     */
    const FLASK_BUFFS = {
      data: { auras: [{ guid: 431971, name: 'Flask of Alchemical Chaos', totalUptime: 300000 }] },
    };

    const buffedFight = (code: string) => plainFight(code, { buffs: FLASK_BUFFS });

    /** Le nombre de requêtes parties chez WCL depuis le dernier `mockFights`. */
    function wclCalls(): number {
      return (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    }

    /**
     * Un Redis en mémoire : les tests de cache ont besoin qu'une écriture soit relisible,
     * ce qu'un `mockResolvedValue` ne donne pas. Les trois commandes sont celles que les
     * caches de référence utilisent, avec leur contrat — dont l'alignement du `MGET`.
     */
    function liveRedis(): Map<string, string> {
      const store = new Map<string, string>();
      redisGet.mockImplementation((k: string) => Promise.resolve(store.get(k) ?? null));
      redisMGet.mockImplementation((keys: string[]) =>
        Promise.resolve(keys.map((k) => store.get(k) ?? null))
      );
      redisSetEx.mockImplementation((k: string, v: string) => {
        store.set(k, v);
        return Promise.resolve(undefined);
      });
      return store;
    }

    /**
     * Le miroir du test de complétude du vivier : une entrée trouée n'est pas écrite.
     *
     * Le combattant arrive sans équipement, donc `tierPieces` vaut `null`. Or `disqualify`
     * ne disqualifie jamais sur un `null` : mise en cache, cette entrée promouvrait pour
     * vingt-quatre heures, et pour tous les utilisateurs de la spec, un candidat que le set
     * bonus devait peut-être écarter.
     */
    it('refuses to cache a verification read from a report without gear', async () => {
      // La table de buffs, elle, est pleine : le seul motif de refus doit être le trou de
      // l'équipement, sans quoi le test passerait pour la mauvaise raison.
      mockFights((code) =>
        plainFight(code, {
          combatants: [{ sourceID: 4, specID: 103, agility: 14000 }],
          buffs: PI_BUFFS,
        })
      );

      const { topPlayers } = await resolve([ranking('holed', 285)]);

      expect(topPlayers[0].provenance.tierPieces).toBeNull();
      // Nommer la clé, et pas seulement le spy : `buildTopPlayer` écrit son propre cache par
      // le même `redisSetEx`, et un `not.toHaveBeenCalled` nu confondrait les deux.
      expect(redisSetEx).not.toHaveBeenCalledWith(
        verificationCacheKey({ code: 'holed', fightID: 1, name: 'holed' }),
        expect.anything(),
        expect.anything()
      );
    });

    // Le TTL est la garantie vis-à-vis du §5d, comme sur le vivier : une copie sans
    // expiration serait la base de données permanente que les CGU refusent.
    it('writes a complete verification with an explicit TTL', async () => {
      mockFights(buffedFight);

      await resolve([ranking('near', 285)]);

      expect(redisSetEx).toHaveBeenCalledWith(
        verificationCacheKey({ code: 'near', fightID: 1, name: 'near' }),
        expect.any(String),
        REFERENCE_TTL_SECONDS
      );
    });

    /**
     * La table des externals est une *entrée* du profil mis en cache : ce qui a été écrit
     * avant qu'un sort y entre mesure autre chose. Sans empreinte dans la clé, le sort ajouté
     * ne disqualifierait personne jusqu'à expiration des entrées d'avant.
     */
    it('changes the verification key when OFFENSIVE_EXTERNALS changes', () => {
      const args = { code: 'abc', fightID: 1, name: 'Aidan' };
      const before = verificationCacheKey(args);

      OFFENSIVE_EXTERNALS[123456] = 'Un external offensif de plus';
      try {
        expect(verificationCacheKey(args)).not.toBe(before);
      } finally {
        delete OFFENSIVE_EXTERNALS[123456];
      }

      // Et l'empreinte revient : elle est recalculée à chaque clé, pas figée au chargement.
      expect(verificationCacheKey(args)).toBe(before);
    });

    // Échoue ouvert, comme le vivier : un cache muet coûte des requêtes, jamais une analyse.
    it('falls back to a live verification when the cache read fails', async () => {
      redisGet.mockRejectedValue(new Error('upstash down'));
      redisMGet.mockRejectedValue(new Error('upstash down'));
      redisSetEx.mockRejectedValue(new Error('upstash down'));
      mockFights();

      // La fenêtre rendue reste alignée sur les clés demandées : c'est l'index qui apparie
      // une entrée à son candidat, donc un tableau court décalerait tous les suivants.
      await expect(readCachedVerifications(['a', 'b'])).resolves.toEqual([null, null]);

      const { topPlayers } = await resolve([ranking('near', 285), ranking('far', 288)]);

      expect(topPlayers.map((p) => p.provenance.name)).toEqual(['near', 'far']);
      expect(topPlayers[0].stats.avgIlvl).toBe(640);
    });

    /**
     * Le bout en bout : deux analyses successives de la même (spec, boss, difficulté), par
     * deux joueurs différents. Le partage est par candidat, pas par demandeur — c'est ce qui
     * fait tomber la seconde facture, et c'est ce que ce test mesure.
     */
    it('serves a second analysis of the same boss for under ten WCL calls', async () => {
      liveRedis();
      mockFights(buffedFight);

      const pool = Array.from({ length: TOP_N + 1 }, (_, i) => ranking(`R${i}`, MY_ILVL + i));

      const first = await resolve(pool);
      const cold = wclCalls();

      // Un autre demandeur : son `mine` diffère, donc `disqualify` est recalculé à chaud —
      // seule la vérification, qui ne le connaît pas, est reprise du cache.
      const second = await resolve(pool, {
        mine: { tierPieces: 2, externalUptime: 0, externals: [] },
        exclude: { code: 'someone-else', fightID: 7 },
      });
      const warm = wclCalls() - cold;

      expect(cold).toBeGreaterThan(10);
      // Zéro, et pas seulement « sous dix » : sur un vivier déjà fourni, la vérification et les
      // données de combat sont tout ce que `resolveReferences` demande à WCL. Le chiffre est
      // asserté tel quel — un `toBeLessThan(10)` laisserait une régression à neuf appels passer.
      expect(warm).toBe(0);
      // Et le panel est le même : l'économie vient du cache, pas d'une analyse dégradée.
      expect(second.topPlayers.map((p) => p.provenance.name)).toEqual(
        first.topPlayers.map((p) => p.provenance.name)
      );
      expect(second.topPlayers[0].stats).toEqual(first.topPlayers[0].stats);
      expect(second.topPlayers[0].damageTable).toEqual(first.topPlayers[0].damageTable);
    });
  });
});
