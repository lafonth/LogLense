import type { CachedFightData, CachedVerification } from '../reference-cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fightDataCacheKey,
  readCachedFightData,
  readCachedVerifications,
  REFERENCE_TTL_SECONDS,
  verificationCacheKey,
  writeCachedFightData,
  writeCachedVerification,
} from '../reference-cache';

const { redisGet, redisMGet, redisSetEx } = vi.hoisted(() => ({
  redisGet: vi.fn(),
  redisMGet: vi.fn(),
  redisSetEx: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({ redisGet, redisMGet, redisSetEx }));

/**
 * The externals table is an input of the cached profile, so the key carries its
 * fingerprint. Mutable here on purpose: the fingerprint is recomputed per call, and this
 * is the test the module header says must not be lied to.
 */
const { externals } = vi.hoisted(() => ({ externals: {} as Record<number, string> }));

vi.mock('../eligibility', () => ({ OFFENSIVE_EXTERNALS: externals }));

const ARGS = { code: 'aBcDeFgH12345678', fightID: 7, name: 'Alpha' };

function verification(over: Partial<CachedVerification> = {}): CachedVerification {
  return {
    combatant: { sourceID: 11, specID: 63, gear: [] },
    profile: { tierPieces: 4, externalUptime: 0, externals: [] },
    aurasRead: 42,
    ...over,
  };
}

function fightData(over: Partial<CachedFightData> = {}): CachedFightData {
  return {
    stats: {
      name: 'Alpha',
      avgIlvl: 639,
      primaryStat: 12_000,
      crit: 31,
      haste: 22,
      mastery: 18,
      vers: 9,
      talents: {},
    },
    rotation: { name: 'Alpha', fightDurationMs: 300_000, casts: {}, buffs: {}, opening: [] },
    damageEntries: [{ guid: 133, name: 'Fireball', total: 900_000_000 }],
    fightTargets: [{ name: 'Boss', type: 'NPC', damagePct: 100 }],
    ...over,
  };
}

beforeEach(() => {
  for (const guid of Object.keys(externals)) delete externals[Number(guid)];
  externals[10060] = 'Power Infusion';
  redisGet.mockReset();
  redisMGet.mockReset();
  redisSetEx.mockReset();
  redisSetEx.mockResolvedValue(undefined);
});

describe('verificationCacheKey', () => {
  it('puts the player name last, where an exotic one cannot spill onto another field', () => {
    expect(verificationCacheKey(ARGS).endsWith(':aBcDeFgH12345678:7:Alpha')).toBe(true);
  });

  it('carries neither user nor spec: two players hitting one candidate verify the same thing', () => {
    expect(verificationCacheKey(ARGS)).toBe(verificationCacheKey({ ...ARGS }));
    expect(verificationCacheKey(ARGS).startsWith('wcl:verify:v1:')).toBe(true);
  });

  it('separates two fights of one report', () => {
    expect(verificationCacheKey(ARGS)).not.toBe(verificationCacheKey({ ...ARGS, fightID: 8 }));
  });

  it('changes when a spell joins the externals table, so old entries stop being served', () => {
    const before = verificationCacheKey(ARGS);
    externals[80353] = 'Time Warp';
    expect(verificationCacheKey(ARGS)).not.toBe(before);
  });

  it('does not change when the table is merely reordered', () => {
    externals[80353] = 'Time Warp';
    const before = verificationCacheKey(ARGS);
    delete externals[10060];
    externals[10060] = 'Power Infusion';
    expect(verificationCacheKey(ARGS)).toBe(before);
  });
});

describe('fightDataCacheKey', () => {
  it('keys on report, fight and actor only: a past pull no longer moves', () => {
    expect(fightDataCacheKey({ code: 'aaa', fightID: 7, sourceID: 11 })).toBe(
      'wcl:fight:v2:aaa:7:11'
    );
  });
});

describe('readCachedVerifications', () => {
  it('returns one slot per key, in order, hits and misses alike', async () => {
    redisMGet.mockResolvedValue([
      JSON.stringify(verification()),
      null,
      JSON.stringify(verification()),
    ]);
    const read = await readCachedVerifications(['a', 'b', 'c']);
    expect(read).toHaveLength(3);
    expect(read[0]).toEqual(verification());
    expect(read[1]).toBeNull();
  });

  it('stays aligned on the keys when Redis throws, so the window keeps its shape', async () => {
    redisMGet.mockRejectedValue(new Error('upstash refused'));
    await expect(readCachedVerifications(['a', 'b', 'c'])).resolves.toEqual([null, null, null]);
  });

  it('drops an entry written without gear: a hole promotes a candidate that should be out', async () => {
    redisMGet.mockResolvedValue([
      JSON.stringify(
        verification({ profile: { tierPieces: null, externalUptime: 0, externals: [] } })
      ),
    ]);
    await expect(readCachedVerifications(['a'])).resolves.toEqual([null]);
  });

  it('drops an entry whose buff table was empty, which is an amputated report', async () => {
    redisMGet.mockResolvedValue([JSON.stringify(verification({ aurasRead: 0 }))]);
    await expect(readCachedVerifications(['a'])).resolves.toEqual([null]);
  });

  it('drops entries of another shape rather than serving them as they are', async () => {
    const cases = [
      '{ not json',
      JSON.stringify({ ...verification(), aurasRead: 'many' }),
      JSON.stringify({ ...verification(), combatant: {} }),
      JSON.stringify({ ...verification(), profile: { tierPieces: 4, externals: [] } }),
      JSON.stringify({
        ...verification(),
        profile: { tierPieces: '4', externalUptime: 0, externals: [] },
      }),
      JSON.stringify({
        ...verification(),
        profile: { tierPieces: 4, externalUptime: 0, externals: 'PI' },
      }),
    ];
    redisMGet.mockResolvedValue(cases);
    await expect(readCachedVerifications(cases.map((_, i) => String(i)))).resolves.toEqual(
      cases.map(() => null)
    );
  });
});

describe('readCachedFightData', () => {
  it('reads back what was written', async () => {
    redisGet.mockResolvedValue(JSON.stringify(fightData()));
    await expect(readCachedFightData('k')).resolves.toEqual(fightData());
  });

  it('fails open on a silent cache, on a throw and on unreadable JSON', async () => {
    redisGet.mockResolvedValue(null);
    await expect(readCachedFightData('k')).resolves.toBeNull();

    redisGet.mockRejectedValue(new Error('upstash refused'));
    await expect(readCachedFightData('k')).resolves.toBeNull();

    redisGet.mockResolvedValue('{ not json');
    await expect(readCachedFightData('k')).resolves.toBeNull();
  });

  it('drops an empty damage table: a ranked player dealt damage', async () => {
    redisGet.mockResolvedValue(JSON.stringify(fightData({ damageEntries: [] })));
    await expect(readCachedFightData('k')).resolves.toBeNull();
  });

  it('drops an entry written before les cibles, que la version de clé sépare déjà', async () => {
    const { fightTargets: _dropped, ...v1 } = fightData();
    redisGet.mockResolvedValue(JSON.stringify(v1));
    await expect(readCachedFightData('k')).resolves.toBeNull();
  });

  it('drops an entry missing its stats or its rotation', async () => {
    redisGet.mockResolvedValue(JSON.stringify({ ...fightData(), stats: null }));
    await expect(readCachedFightData('k')).resolves.toBeNull();

    redisGet.mockResolvedValue(JSON.stringify({ ...fightData(), rotation: null }));
    await expect(readCachedFightData('k')).resolves.toBeNull();
  });
});

describe('writeCachedVerification', () => {
  it('writes with an explicit expiry, twenty-four hours like the partitions', async () => {
    await writeCachedVerification('k', verification());
    expect(redisSetEx).toHaveBeenCalledWith(
      'k',
      JSON.stringify(verification()),
      REFERENCE_TTL_SECONDS
    );
    expect(REFERENCE_TTL_SECONDS).toBe(24 * 60 * 60);
  });

  it('refuses to install a hole for a day, on either of its two forms', async () => {
    await writeCachedVerification(
      'k',
      verification({ profile: { tierPieces: null, externalUptime: 0, externals: [] } })
    );
    await writeCachedVerification('k', verification({ aurasRead: 0 }));
    expect(redisSetEx).not.toHaveBeenCalled();
  });

  it('drops a body over the cap', async () => {
    await writeCachedVerification(
      'k',
      verification({
        profile: { tierPieces: 4, externalUptime: 0, externals: ['x'.repeat(500_000)] },
      })
    );
    expect(redisSetEx).not.toHaveBeenCalled();
  });

  it('swallows a failed write: the verification is already done', async () => {
    redisSetEx.mockRejectedValue(new Error('upstash refused'));
    await expect(writeCachedVerification('k', verification())).resolves.toBeUndefined();
  });
});

describe('writeCachedFightData', () => {
  it('writes with the same explicit expiry', async () => {
    await writeCachedFightData('k', fightData());
    expect(redisSetEx).toHaveBeenCalledWith(
      'k',
      JSON.stringify(fightData()),
      REFERENCE_TTL_SECONDS
    );
  });

  it('never writes an empty damage table, which is a failed request', async () => {
    await writeCachedFightData('k', fightData({ damageEntries: [] }));
    expect(redisSetEx).not.toHaveBeenCalled();
  });

  it('drops a body over the cap', async () => {
    await writeCachedFightData(
      'k',
      fightData({
        damageEntries: [{ guid: 133, name: 'x'.repeat(500_000), total: 1 }],
      })
    );
    expect(redisSetEx).not.toHaveBeenCalled();
  });

  it('swallows a failed write', async () => {
    redisSetEx.mockRejectedValue(new Error('upstash refused'));
    await expect(writeCachedFightData('k', fightData())).resolves.toBeUndefined();
  });
});
