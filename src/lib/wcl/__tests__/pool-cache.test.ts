import type { PoolSlice } from '../references';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POOL_TTL_SECONDS, poolCacheKey, readCachedPool, writeCachedPool } from '../pool-cache';

const { redisGet, redisSetEx } = vi.hoisted(() => ({
  redisGet: vi.fn(),
  redisSetEx: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({ redisGet, redisSetEx }));

const KEY = 'wcl:pool:v3:2902:5:mage:fire:b0:anyext';

/** Les arguments de clé du vivier non filtré : celui que tous les joueurs d'une spec partagent. */
const UNFILTERED = {
  encounterId: 2902,
  difficulty: 5,
  specName: 'Fire',
  className: 'Mage',
  bracket: 0,
  excludeExternals: false,
};

function pool(over: Partial<PoolSlice> = {}): PoolSlice {
  return {
    candidates: [
      { name: 'Alpha', amount: 812_346, duration: 300_000, report: { code: 'aaa', fightID: 3 } },
    ],
    pagesFetched: 10,
    pagesExpected: 10,
    ...over,
  };
}

beforeEach(() => {
  redisGet.mockReset();
  redisSetEx.mockReset();
  redisSetEx.mockResolvedValue(undefined);
});

describe('poolCacheKey', () => {
  it('normalises case and spaces, so two spellings of one spec share an entry', () => {
    expect(poolCacheKey(UNFILTERED)).toBe(KEY);
    expect(poolCacheKey({ ...UNFILTERED, specName: 'FIRE', className: 'MAGE' })).toBe(KEY);
  });

  it('turns the spaces of a two-word spec into dashes, on both halves', () => {
    expect(
      poolCacheKey({
        ...UNFILTERED,
        encounterId: 2917,
        difficulty: 4,
        specName: 'Beast Mastery',
        className: 'Demon Hunter',
      })
    ).toBe('wcl:pool:v3:2917:4:demon-hunter:beast-mastery:b0:anyext');
  });

  it('carries the format version, which is what expires the whole cache at once', () => {
    expect(KEY.startsWith('wcl:pool:v3:')).toBe(true);
  });

  it('separates two difficulties of the same boss', () => {
    expect(poolCacheKey({ ...UNFILTERED, difficulty: 4 })).not.toBe(KEY);
  });

  // Par bracket et non par fenêtre de brackets : c'est ce qui garde le cache payant une fois
  // le filtre d'ilvl posé. Deux joueurs d'ilvl voisins ne demandent pas la même fenêtre, mais
  // ils demandent les mêmes tranches, et chacune est ici une entrée à part entière.
  it('gives each bracket its own entry, the unfiltered pool included', () => {
    const b15 = poolCacheKey({ ...UNFILTERED, bracket: 15 });
    const b16 = poolCacheKey({ ...UNFILTERED, bracket: 16 });

    expect(b15).not.toBe(b16);
    expect(b15).not.toBe(KEY);
    expect(b15).toBe('wcl:pool:v3:2902:5:mage:fire:b15:anyext');
  });

  // Aucun repli entre les deux : un vivier purgé des candidats aidés et un vivier qui les
  // garde ne répondent pas à la même question, et les confondre rendrait le filtre inopérant
  // pour la moitié des joueurs.
  it('never lets a pool purged of external carriers answer for one that kept them', () => {
    expect(poolCacheKey({ ...UNFILTERED, excludeExternals: true })).toBe(
      'wcl:pool:v3:2902:5:mage:fire:b0:noext'
    );
    expect(poolCacheKey({ ...UNFILTERED, excludeExternals: true })).not.toBe(KEY);
  });
});

describe('readCachedPool', () => {
  it('reads back what was written', async () => {
    redisGet.mockResolvedValue(JSON.stringify(pool()));
    await expect(readCachedPool(KEY)).resolves.toEqual(pool());
  });

  it('treats a silent cache as a miss', async () => {
    redisGet.mockResolvedValue(null);
    await expect(readCachedPool(KEY)).resolves.toBeNull();
  });

  it('treats an empty string as a miss, not as an empty pool', async () => {
    redisGet.mockResolvedValue('');
    await expect(readCachedPool(KEY)).resolves.toBeNull();
  });

  it('fails open when Redis throws: a lost cache costs requests, never the analysis', async () => {
    redisGet.mockRejectedValue(new Error('upstash refused'));
    await expect(readCachedPool(KEY)).resolves.toBeNull();
  });

  it('fails open on unreadable JSON', async () => {
    redisGet.mockResolvedValue('{ not json');
    await expect(readCachedPool(KEY)).resolves.toBeNull();
  });

  it('rejects an entry whose shape is not the one of today', async () => {
    redisGet.mockResolvedValue(
      JSON.stringify({ candidates: 'nope', pagesFetched: 10, pagesExpected: 10 })
    );
    await expect(readCachedPool(KEY)).resolves.toBeNull();

    redisGet.mockResolvedValue(JSON.stringify({ candidates: [], pagesExpected: 10 }));
    await expect(readCachedPool(KEY)).resolves.toBeNull();

    redisGet.mockResolvedValue(JSON.stringify({ candidates: [], pagesFetched: 10 }));
    await expect(readCachedPool(KEY)).resolves.toBeNull();
  });
});

describe('writeCachedPool', () => {
  it('names the expiry at write time: the TTL is what the ToS make of the copy', async () => {
    await writeCachedPool(KEY, pool());
    expect(redisSetEx).toHaveBeenCalledWith(KEY, JSON.stringify(pool()), POOL_TTL_SECONDS);
  });

  it('keeps that expiry at six hours', () => {
    expect(POOL_TTL_SECONDS).toBe(6 * 60 * 60);
  });

  it('never writes an incomplete pool: a missing page would freeze a fluke for six hours', async () => {
    await writeCachedPool(KEY, pool({ pagesFetched: 9, pagesExpected: 10 }));
    expect(redisSetEx).not.toHaveBeenCalled();
  });

  it('writes a pool that fetched more pages than it expected', async () => {
    await writeCachedPool(KEY, pool({ pagesFetched: 11, pagesExpected: 10 }));
    expect(redisSetEx).toHaveBeenCalledTimes(1);
  });

  it('drops a body over the cap rather than failing the write on every analysis', async () => {
    const huge = pool({
      candidates: Array.from({ length: 20 }, (_, i) => ({
        name: 'x'.repeat(70_000),
        amount: i,
        duration: 300_000,
        report: { code: 'aaa', fightID: i },
      })),
    });
    await writeCachedPool(KEY, huge);
    expect(redisSetEx).not.toHaveBeenCalled();
  });

  it('swallows a failed write: the analysis is already computed', async () => {
    redisSetEx.mockRejectedValue(new Error('upstash refused'));
    await expect(writeCachedPool(KEY, pool())).resolves.toBeUndefined();
  });
});
