import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { redisGet, redisSet } from '@/lib/redis';

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
