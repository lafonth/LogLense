import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { redisAppend, redisGet, redisIncrBy, redisSet, redisSetEx } from '@/lib/redis';

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

describe('redisSetEx', () => {
  // La durée de vie voyage dans la commande, pas dans un EXPIRE séparé : une écriture qui
  // réussit et un EXPIRE qui échoue laisseraient la copie permanente que les CGU refusent.
  it('writes the value and its expiry in one command', async () => {
    mockUpstash('OK');
    await redisSetEx('wcl:pool:v1:1:5:druid:feral', '{"candidates":[]}', 21600);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      BASE,
      expect.objectContaining({
        body: JSON.stringify([
          'SET',
          'wcl:pool:v1:1:5:druid:feral',
          '{"candidates":[]}',
          'EX',
          '21600',
        ]),
      })
    );
  });
});

describe('redisIncrBy', () => {
  it('adds the cost and returns the new counter', async () => {
    mockUpstash(50);

    await expect(redisIncrBy('ratelimit:wcl:abc:1', 50)).resolves.toBe(50);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      BASE,
      expect.objectContaining({
        body: JSON.stringify(['INCRBY', 'ratelimit:wcl:abc:1', '50']),
      })
    );
  });

  // Le quota strict échoue fermé sur une exception : encore faut-il qu'une réponse muette
  // en lève une, au lieu de passer pour un compteur à zéro.
  it('throws when Redis does not return a counter', async () => {
    mockUpstash(null);

    await expect(redisIncrBy('k', 1)).rejects.toThrow(/counter value/);
  });
});
