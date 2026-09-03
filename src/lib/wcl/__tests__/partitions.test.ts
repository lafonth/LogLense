import type { Partition } from '../partitions';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_SEASON_PARTITIONS, PARTITION_TTL_SECONDS } from '../constants';
import {
  clearZoneMemo,
  encounterZoneKey,
  resolveSeasonPartitions,
  resolveZoneRankingContext,
  seasonOf,
  seasonPartitions,
  zoneBracketsKey,
  zonePartitionsKey,
} from '../partitions';

const { redisGet, redisSetEx } = vi.hoisted(() => ({
  redisGet: vi.fn(),
  redisSetEx: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({ redisGet, redisSetEx }));

/**
 * Le relevé réel du palier courant (zone 46), `default` compris.
 *
 * Les quatre noms viennent de l'API, pas d'une supposition : c'est ce jeu qui fait de
 * l'ancrage sur `default` une erreur, puisque WCL désigne ici la saison 2.
 */
const CURRENT_TIER: Partition[] = [
  { id: 1, name: '12.0', default: false },
  { id: 2, name: '12.0.5', default: false },
  { id: 3, name: '12.0.7', default: false },
  { id: 4, name: '12.1', default: true },
];

/** Le découpage d'ilvl relevé sur le palier courant au spike de l'étape 3. */
const TIER_BRACKETS = { type: 'Item Level', min: 272, max: 344, bucket: 3 };

describe('seasonOf', () => {
  it('groups the patches of one season under their two leading segments', () => {
    expect(seasonOf('12.0')).toBe('12.0');
    expect(seasonOf('12.0.5')).toBe('12.0');
    expect(seasonOf('12.0.7')).toBe('12.0');
  });

  it('separates the next season', () => {
    expect(seasonOf('12.1')).not.toBe(seasonOf('12.0.7'));
    expect(seasonOf('12.1')).toBe('12.1');
  });

  // La saison 1 de la version 12 s'écrit indifféremment `12` ou `12.0` ; les deux formes
  // doivent tomber dans le même groupe, sinon elle se scinde.
  it('reads a bare major version as its own .0', () => {
    expect(seasonOf('12')).toBe('12.0');
    expect(seasonOf('12')).toBe(seasonOf('12.0.7'));
  });

  it('leaves a non-numeric name alone', () => {
    expect(seasonOf('default')).toBe('default');
  });
});

describe('seasonPartitions', () => {
  // Le test qui verrouille la décision : `12.1` est écartée *bien qu'elle soit* la partition
  // par défaut de WCL. S'y fier rendrait cinq logs au lieu de plusieurs milliers.
  it('keeps the season the tier opened in, and drops the default partition of the next', () => {
    expect(seasonPartitions(CURRENT_TIER)).toEqual([1, 2, 3]);
  });

  it('does not depend on the order the partitions arrive in', () => {
    expect(seasonPartitions([...CURRENT_TIER].reverse())).toEqual([1, 2, 3]);
  });

  it('returns nothing when the zone exposes no partition', () => {
    expect(seasonPartitions([])).toEqual([]);
  });

  // Les paliers anciens n'ont qu'une partition `default` : le comportement dégénère
  // exactement sur celui d'avant le correctif.
  it('resolves a legacy single-partition tier to that partition', () => {
    expect(seasonPartitions([{ id: 1, name: 'default', default: true }])).toEqual([1]);
  });

  it('keeps the most recent partitions when a season has too many', () => {
    const crowded: Partition[] = Array.from({ length: MAX_SEASON_PARTITIONS + 2 }, (_, i) => ({
      id: i + 1,
      name: `12.0.${i}`,
      default: false,
    }));

    const ids = seasonPartitions(crowded);

    expect(ids).toHaveLength(MAX_SEASON_PARTITIONS);
    expect(ids.at(-1)).toBe(MAX_SEASON_PARTITIONS + 2);
    expect(ids).not.toContain(1);
  });
});

describe('resolveSeasonPartitions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    redisGet.mockResolvedValue(null);
    redisSetEx.mockResolvedValue(undefined);
    clearZoneMemo();
  });

  /** Les rencontres du palier courant, relevées sur l'API : `3306` en fait partie. */
  const ZONE_ENCOUNTERS = [3176, 3177, 3179, 3178, 3180, 3181, 3306, 3182, 3183];

  const ok = (data: unknown) => ({ ok: true, json: async () => ({ data }) }) as Response;
  const zone = (
    partitions: Partition[] | null,
    encounters = ZONE_ENCOUNTERS,
    brackets: unknown = TIER_BRACKETS
  ) =>
    ok({
      worldData: {
        encounter:
          partitions === null
            ? null
            : {
                zone: {
                  id: 46,
                  encounters: encounters.map((id) => ({ id })),
                  partitions,
                  brackets,
                },
              },
      },
    });

  /** Une réponse en échec sur toutes les tentatives, sans délai demandé. */
  const failed = () =>
    ({ ok: false, status: 500, headers: { get: () => null } }) as unknown as Response;

  /** Le cache chaud d'un conteneur qui démarre froid : le palier, puis sa liste. */
  const cachedZone = (ids: number[], brackets: unknown = { min: 272, max: 344, bucket: 3 }) =>
    redisGet.mockImplementation(async (key: string) => {
      if (key === encounterZoneKey(3306)) return '46';
      if (key === zonePartitionsKey(46)) return JSON.stringify(ids);
      if (key === zoneBracketsKey(46)) return JSON.stringify(brackets);
      return null;
    });

  it('serves the cached list without asking Warcraft Logs', async () => {
    cachedZone([1, 2, 3]);
    globalThis.fetch = vi.fn();

    await expect(resolveSeasonPartitions('token', 3306)).resolves.toEqual([1, 2, 3]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('ignores a cached value that is not a list of ids', async () => {
    redisGet.mockImplementation(async (key: string) => {
      if (key === encounterZoneKey(3306)) return '46';
      if (key === zonePartitionsKey(46)) return JSON.stringify({ ids: [1, 2] });
      if (key === zoneBracketsKey(46)) return JSON.stringify({ min: 272, max: 344, bucket: 3 });
      return null;
    });
    globalThis.fetch = vi.fn().mockResolvedValue(zone(CURRENT_TIER));

    await expect(resolveSeasonPartitions('token', 3306)).resolves.toEqual([1, 2, 3]);
  });

  // Une liste de partitions bouge quelques fois par palier ; sans expiration elle ne bougerait
  // plus jamais, et un nouveau patch resterait invisible.
  it('caches the resolved list under the zone, with an explicit expiry', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(zone(CURRENT_TIER));

    await resolveSeasonPartitions('token', 3306);

    expect(redisSetEx).toHaveBeenCalledWith(
      zonePartitionsKey(46),
      JSON.stringify([1, 2, 3]),
      PARTITION_TTL_SECONDS
    );
  });

  // Ce qui rend la liste réutilisable par un conteneur froid : sans ce pont, il devrait payer
  // une requête juste pour apprendre quelle zone lire.
  it('maps every encounter of the tier to its zone', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(zone(CURRENT_TIER));

    await resolveSeasonPartitions('token', 3306);

    for (const id of ZONE_ENCOUNTERS) {
      expect(redisSetEx).toHaveBeenCalledWith(encounterZoneKey(id), '46', PARTITION_TTL_SECONDS);
    }
  });

  // Le test qui porte l'économie. Les rencontres d'un rapport partent ensemble : elles lisent
  // toutes le cache avant que la première réponse ne revienne, donc seul un partage en vol
  // peut les empêcher de redemander la même liste.
  it('asks once for a whole tier analysed in parallel', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(zone(CURRENT_TIER));

    const resolved = await Promise.all(
      ZONE_ENCOUNTERS.map((id) => resolveSeasonPartitions('token', id))
    );

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    for (const ids of resolved) expect(ids).toEqual([1, 2, 3]);
  });

  // La contrepartie : deux paliers analysés en même temps ne doivent pas se voler leur
  // réponse. Celui que la découverte en vol ne couvre pas lance la sienne.
  it('does not serve a tier from another tier resolution in flight', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (_url, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { variables: { encounterID: number } };
      return body.variables.encounterID === 3306
        ? zone(CURRENT_TIER)
        : zone([{ id: 9, name: '11.1', default: true }], [2900]);
    });

    const [tier, other] = await Promise.all([
      resolveSeasonPartitions('token', 3306),
      resolveSeasonPartitions('token', 2900),
    ]);

    expect(tier).toEqual([1, 2, 3]);
    expect(other).toEqual([9]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  // Échoue ouvert : `[]` veut dire « interroge sans argument `partition` ». Le vivier est
  // pauvre, mais l'analyse aboutit — l'inverse du quota, qui doit refuser.
  it('gives up on the season rather than the analysis when Warcraft Logs fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(failed());

    await expect(resolveSeasonPartitions('token', 3306)).resolves.toEqual([]);
    expect(redisSetEx).not.toHaveBeenCalled();
  });

  it('gives up when the encounter carries no zone', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(zone(null));

    await expect(resolveSeasonPartitions('token', 3306)).resolves.toEqual([]);
    expect(redisSetEx).not.toHaveBeenCalled();
  });

  // Une zone qui ne rend pas ses rencontres reste résolue pour celle qu'on a demandée : la
  // dégradation coûte des requêtes, jamais un résultat.
  it('resolves the requested encounter when the zone lists none', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(zone(CURRENT_TIER, []));

    await expect(resolveSeasonPartitions('token', 3306)).resolves.toEqual([1, 2, 3]);
    expect(redisSetEx).toHaveBeenCalledWith(encounterZoneKey(3306), '46', PARTITION_TTL_SECONDS);
  });

  it('resolves the season even when Redis is down on both ends', async () => {
    redisGet.mockRejectedValue(new Error('upstash down'));
    redisSetEx.mockRejectedValue(new Error('upstash down'));
    globalThis.fetch = vi.fn().mockResolvedValue(zone(CURRENT_TIER));

    await expect(resolveSeasonPartitions('token', 3306)).resolves.toEqual([1, 2, 3]);
  });

  // Un id de zone et un id de rencontre sont tous deux des entiers : sans préfixes distincts,
  // la zone 46 et la rencontre 46 partageraient une entrée.
  it('never collides a zone key with an encounter key', () => {
    expect(zonePartitionsKey(46)).not.toBe(encounterZoneKey(46));
    expect(zoneBracketsKey(46)).not.toBe(zonePartitionsKey(46));
  });
});

describe('resolveZoneRankingContext', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    redisGet.mockResolvedValue(null);
    redisSetEx.mockResolvedValue(undefined);
    clearZoneMemo();
  });

  const ok = (data: unknown) => ({ ok: true, json: async () => ({ data }) }) as Response;
  const zone = (brackets: unknown) =>
    ok({
      worldData: {
        encounter: {
          zone: { id: 46, encounters: [{ id: 3306 }], partitions: CURRENT_TIER, brackets },
        },
      },
    });

  // Le découpage arrive par la requête qui résolvait déjà les partitions : zéro requête de
  // plus, et c'est ce qui rend le filtre d'ilvl gratuit à l'échelle de l'analyse.
  it('brings the tier ilvl brackets back with its partitions, in one request', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(zone(TIER_BRACKETS));

    const context = await resolveZoneRankingContext('token', 3306);

    expect(context.partitionIds).toEqual([1, 2, 3]);
    expect(context.brackets).toEqual({ min: 272, max: 344, bucket: 3 });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  // Filtrer sur un axe qu'on prend pour l'ilvl écarterait le vivier au hasard, en silence.
  it('refuses a bracketing that is not on item level', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(zone({ ...TIER_BRACKETS, type: 'Boss Percentage' }));

    await expect(resolveZoneRankingContext('token', 3306)).resolves.toMatchObject({
      partitionIds: [1, 2, 3],
      brackets: null,
    });
  });

  it('caches the bracketing beside the partitions, with the same expiry', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(zone(TIER_BRACKETS));

    await resolveZoneRankingContext('token', 3306);

    expect(redisSetEx).toHaveBeenCalledWith(
      zoneBracketsKey(46),
      JSON.stringify({ min: 272, max: 344, bucket: 3 }),
      PARTITION_TTL_SECONDS
    );
  });

  // `null` est une valeur écrite, pas une absence : un palier peut légitimement ne pas
  // découper sur l'ilvl, et le redemander à chaque analyse paierait la même réponse vide.
  it('reads back a cached absence of bracketing without asking again', async () => {
    redisGet.mockImplementation(async (key: string) => {
      if (key === encounterZoneKey(3306)) return '46';
      if (key === zonePartitionsKey(46)) return JSON.stringify([1, 2, 3]);
      if (key === zoneBracketsKey(46)) return 'null';
      return null;
    });
    globalThis.fetch = vi.fn();

    await expect(resolveZoneRankingContext('token', 3306)).resolves.toEqual({
      partitionIds: [1, 2, 3],
      brackets: null,
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  // Les deux clés sont écrites ensemble : une entrée de partitions sans son découpage vient
  // d'une génération antérieure, et la servir priverait le vivier du filtre pour tout le TTL.
  it('treats a partitions entry without its bracketing as a miss, and re-resolves once', async () => {
    redisGet.mockImplementation(async (key: string) => {
      if (key === encounterZoneKey(3306)) return '46';
      if (key === zonePartitionsKey(46)) return JSON.stringify([1, 2, 3]);
      return null;
    });
    globalThis.fetch = vi.fn().mockResolvedValue(zone(TIER_BRACKETS));

    const context = await resolveZoneRankingContext('token', 3306);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(context.brackets).toEqual({ min: 272, max: 344, bucket: 3 });
  });
});
