import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LABEL_LIMIT } from '@/lib/labels/rate-limit';
import { POST } from '../route';

const { getServerSession, redisAppend, redisIncr, redisExpire } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  redisAppend: vi.fn(),
  redisIncr: vi.fn(),
  redisExpire: vi.fn(),
}));

vi.mock('next-auth/next', () => ({ getServerSession }));
vi.mock('@/lib/redis', () => ({ redisAppend, redisIncr, redisExpire }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

function body(overrides: Record<string, unknown> = {}) {
  return {
    renderId: 'a3f1c2d4-0000-4000-8000-000000000001',
    reason: 'externals',
    encounterId: 3177,
    difficulty: 5,
    specId: 103,
    subject: { code: 'abc', fightID: 17, actorId: 63 },
    reference: { code: 'xyz', fightID: 3, actorId: 12, disqualifiedBy: [] },
    scores: { distance: 0.42, ilvlGap: 0.9, killTimeGapPct: -2.7, rank: 1 },
    ...overrides,
  };
}

function request(payload: unknown) {
  return new Request('http://localhost/api/labels/comparability', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as never;
}

describe('pOST /api/labels/comparability', () => {
  const originalSalt = process.env.LABEL_SALT;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LABEL_SALT = 'pepper';
    getServerSession.mockResolvedValue({ user: { email: 'someone@example.com' } });
    redisAppend.mockResolvedValue(1);
    redisIncr.mockResolvedValue(1);
    redisExpire.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalSalt === undefined) delete process.env.LABEL_SALT;
    else process.env.LABEL_SALT = originalSalt;
  });

  it('stores a valid label without disclosing the corpus size', async () => {
    const res = await POST(request(body()));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(redisAppend).toHaveBeenCalledTimes(1);
  });

  // Append-only and unclean-able: an oversized body must never reach the corpus.
  it('rejects a body past the size cap', async () => {
    const res = await POST(request(body({ reason: 'externals', padding: 'x'.repeat(5000) })));

    expect(res.status).toBe(413);
    expect(redisAppend).not.toHaveBeenCalled();
  });

  it('writes to the month bucket of the current time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-06T09:14:22.000Z'));

    await POST(request(body()));

    expect(redisAppend.mock.calls[0][0]).toBe('labels:comparability:2026-08');
    vi.useRealTimers();
  });

  it('stamps v, kind, at and a hashed by that is not the email', async () => {
    await POST(request(body()));

    const stored = JSON.parse(String(redisAppend.mock.calls[0][1]));
    expect(stored.v).toBe(3);
    expect(stored.kind).toBe('verdict');
    expect(typeof stored.at).toBe('string');
    expect(stored.by).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(stored)).not.toContain('someone@example.com');
  });

  // La jointure avec l'exposition. Un verdict qui ne s'y rattache pas ne s'exploite pas.
  it('rejects a verdict that carries no renderId', async () => {
    const { renderId, ...withoutRender } = body();

    const res = await POST(request(withoutRender));

    expect(res.status).toBe(400);
    expect(redisAppend).not.toHaveBeenCalled();
  });

  it('stores the renderId of the contested render', async () => {
    await POST(request(body()));

    const stored = JSON.parse(String(redisAppend.mock.calls[0][1]));
    expect(stored.renderId).toBe('a3f1c2d4-0000-4000-8000-000000000001');
  });

  it('ignores a client-supplied identity and timestamp', async () => {
    await POST(
      request(body({ v: 9, kind: 'exposure', at: '1999-01-01T00:00:00.000Z', by: 'someone-else' }))
    );

    const stored = JSON.parse(String(redisAppend.mock.calls[0][1]));
    expect(stored.v).toBe(3);
    expect(stored.kind).toBe('verdict');
    expect(stored.by).not.toBe('someone-else');
    expect(stored.at).not.toBe('1999-01-01T00:00:00.000Z');
  });

  it('rejects an unauthenticated caller', async () => {
    getServerSession.mockResolvedValue(null);

    const res = await POST(request(body()));

    expect(res.status).toBe(401);
    expect(redisAppend).not.toHaveBeenCalled();
  });

  it('rejects an invalid body', async () => {
    const res = await POST(request(body({ reason: 'bad-vibes' })));

    expect(res.status).toBe(400);
    expect(redisAppend).not.toHaveBeenCalled();
  });

  it('rejects an unparseable body', async () => {
    const bad = new Request('http://localhost/api/labels/comparability', {
      method: 'POST',
      body: 'not json',
    }) as never;

    const res = await POST(bad);

    expect(res.status).toBe(400);
    expect(redisAppend).not.toHaveBeenCalled();
  });

  // Fail closed: never write an unsalted identifier into a corpus we cannot clean up.
  it('refuses to write when the salt is missing', async () => {
    delete process.env.LABEL_SALT;

    const res = await POST(request(body()));

    expect(res.status).toBe(503);
    expect(redisAppend).not.toHaveBeenCalled();
  });

  it('reports a storage failure rather than claiming success', async () => {
    redisAppend.mockRejectedValue(new Error('upstash down'));

    const res = await POST(request(body()));

    expect(res.status).toBe(503);
  });

  // Un flot de verdicts fabriqués empoisonne un corpus qu'on ne peut pas nettoyer.
  it('turns a caller away past the hourly quota, and says when to come back', async () => {
    redisIncr.mockResolvedValue(LABEL_LIMIT + 1);

    const res = await POST(request(body()));

    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(redisAppend).not.toHaveBeenCalled();
  });

  it('counts the quota against the hashed identity, never the raw one', async () => {
    await POST(request(body()));

    const key = String(redisIncr.mock.calls[0][0]);
    expect(key).not.toContain('someone@example.com');
    expect(key).toMatch(/^ratelimit:labels:[0-9a-f]{32}:\d+$/);
  });
});
