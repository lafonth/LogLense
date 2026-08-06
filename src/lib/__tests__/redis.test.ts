import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { redisAppend, redisGet, redisSet } from '@/lib/redis';

const BASE = 'https://test.upstash.io';
const TOKEN = 'test-token';

beforeEach(() => {
  process.env.UPSTASH_REDIS_REST_URL = BASE;
  process.env.UPSTASH_REDIS_REST_TOKEN = TOKEN;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

function mockUpstash(result: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result }),
    } as Response)
  );
}

describe('redisGet', () => {
  it('calls Upstash with GET command and returns result', async () => {
    mockUpstash('stored-value');
    const val = await redisGet('some-key');
    expect(val).toBe('stored-value');
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      BASE,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
        body: JSON.stringify(['GET', 'some-key']),
      })
    );
  });

  it('returns null for a missing key', async () => {
    mockUpstash(null);
    expect(await redisGet('missing')).toBeNull();
  });
});

describe('redisSet', () => {
  it('calls Upstash with SET command', async () => {
    mockUpstash('OK');
    await redisSet('my-key', 'my-value');
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      BASE,
      expect.objectContaining({
        body: JSON.stringify(['SET', 'my-key', 'my-value']),
      })
    );
  });
});

describe('redisAppend', () => {
  it('appends with RPUSH and returns the new list length', async () => {
    mockUpstash(7);

    await expect(redisAppend('labels:comparability:2026-08', '{"v":1}')).resolves.toBe(7);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      BASE,
      expect.objectContaining({
        body: JSON.stringify(['RPUSH', 'labels:comparability:2026-08', '{"v":1}']),
      })
    );
  });

  // exec() does not check res.ok, so a failed write would otherwise resolve to undefined
  // and the route would answer 200 for a label that was never stored.
  it('throws when Redis does not return a list length', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'ERR wrong number of arguments' }),
      } as Response)
    );

    await expect(redisAppend('k', 'v')).rejects.toThrow(/list length/);
  });
});
