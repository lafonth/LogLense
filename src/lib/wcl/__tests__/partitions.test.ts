import type { Partition } from '../partitions';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_SEASON_PARTITIONS, PARTITION_TTL_SECONDS } from '../constants';
import {
  partitionCacheKey,
  resolveSeasonPartitions,
  seasonOf,
  seasonPartitions,
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
  });

  const ok = (data: unknown) => ({ ok: true, json: async () => ({ data }) }) as Response;
  const zone = (partitions: Partition[] | null) =>
    ok({ worldData: { encounter: partitions === null ? null : { zone: { id: 46, partitions } } } });

  /** Une réponse en échec sur toutes les tentatives, sans délai demandé. */
  const failed = () =>
    ({ ok: false, status: 500, headers: { get: () => null } }) as unknown as Response;

  it('serves the cached list without asking Warcraft Logs', async () => {
    redisGet.mockResolvedValue(JSON.stringify([1, 2, 3]));
    globalThis.fetch = vi.fn();

    await expect(resolveSeasonPartitions('token', 3306)).resolves.toEqual([1, 2, 3]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(redisGet).toHaveBeenCalledWith(partitionCacheKey(3306));
  });

  it('ignores a cached value that is not a list of ids', async () => {
    redisGet.mockResolvedValue(JSON.stringify({ ids: [1, 2] }));
    globalThis.fetch = vi.fn().mockResolvedValue(zone(CURRENT_TIER));

    await expect(resolveSeasonPartitions('token', 3306)).resolves.toEqual([1, 2, 3]);
  });

  // Une liste de partitions bouge quelques fois par palier ; sans expiration elle ne bougerait
  // plus jamais, et un nouveau patch resterait invisible.
  it('caches the resolved list with an explicit expiry', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(zone(CURRENT_TIER));

    await resolveSeasonPartitions('token', 3306);

    expect(redisSetEx).toHaveBeenCalledWith(
      partitionCacheKey(3306),
      JSON.stringify([1, 2, 3]),
      PARTITION_TTL_SECONDS
    );
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

  it('resolves the season even when Redis is down on both ends', async () => {
    redisGet.mockRejectedValue(new Error('upstash down'));
    redisSetEx.mockRejectedValue(new Error('upstash down'));
    globalThis.fetch = vi.fn().mockResolvedValue(zone(CURRENT_TIER));

    await expect(resolveSeasonPartitions('token', 3306)).resolves.toEqual([1, 2, 3]);
  });

  it('gives two encounters different cache keys', () => {
    expect(partitionCacheKey(3306)).not.toBe(partitionCacheKey(3307));
  });
});
