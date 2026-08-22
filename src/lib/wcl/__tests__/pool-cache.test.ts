import type { CandidatePool } from '../references';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POOL_TTL_SECONDS, poolCacheKey, readCachedPool, writeCachedPool } from '../pool-cache';

const { redisGet, redisSetEx } = vi.hoisted(() => ({
  redisGet: vi.fn(),
  redisSetEx: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({ redisGet, redisSetEx }));

const KEY = 'wcl:pool:v2:2902:5:mage:fire';

function pool(over: Partial<CandidatePool> = {}): CandidatePool {
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
    expect(
      poolCacheKey({ encounterId: 2902, difficulty: 5, specName: 'Fire', className: 'Mage' })
    ).toBe(KEY);
    expect(
      poolCacheKey({ encounterId: 2902, difficulty: 5, specName: 'FIRE', className: 'MAGE' })
    ).toBe(KEY);
  });

  it('turns the spaces of a two-word spec into dashes, on both halves', () => {
    expect(
      poolCacheKey({
        encounterId: 2917,
        difficulty: 4,
        specName: 'Beast Mastery',
        className: 'Demon Hunter',
      })
    ).toBe('wcl:pool:v2:2917:4:demon-hunter:beast-mastery');
  });

  it('carries the format version, which is what expires the whole cache at once', () => {
    expect(KEY.startsWith('wcl:pool:v2:')).toBe(true);
  });

  it('separates two difficulties of the same boss', () => {
    const heroic = poolCacheKey({
      encounterId: 2902,
      difficulty: 4,
      specName: 'Fire',
      className: 'Mage',
    });
    expect(heroic).not.toBe(KEY);
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
