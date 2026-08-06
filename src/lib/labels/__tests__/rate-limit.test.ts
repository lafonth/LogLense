import { beforeEach, describe, expect, it, vi } from 'vitest';
import { consumeLabelQuota, LABEL_LIMIT, rateLimitKey, WINDOW_MS } from '../rate-limit';

const { redisIncr, redisExpire } = vi.hoisted(() => ({
  redisIncr: vi.fn(),
  redisExpire: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({ redisIncr, redisExpire }));

const BY = 'a'.repeat(32);

describe('rateLimitKey', () => {
  it('gives two instants of the same hour the same counter', () => {
    expect(rateLimitKey(BY, WINDOW_MS * 277)).toBe(
      rateLimitKey(BY, WINDOW_MS * 277 + WINDOW_MS - 1)
    );
  });

  it('gives the next window a key of its own, so the old one expires unused', () => {
    expect(rateLimitKey(BY, WINDOW_MS * 277)).not.toBe(
      rateLimitKey(BY, WINDOW_MS * 277 + WINDOW_MS)
    );
  });
});

describe('consumeLabelQuota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisExpire.mockResolvedValue(undefined);
  });

  it('lets the last request of the quota through', async () => {
    redisIncr.mockResolvedValue(LABEL_LIMIT);

    await expect(consumeLabelQuota(BY, 0)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  it('refuses the one past it and points at the next window', async () => {
    redisIncr.mockResolvedValue(LABEL_LIMIT + 1);

    const verdict = await consumeLabelQuota(BY, WINDOW_MS / 2);

    expect(verdict.allowed).toBe(false);
    expect(verdict.retryAfterSeconds).toBe(WINDOW_MS / 2000);
  });

  // La durée de vie est posée à chaque appel : un EXPIRE manqué au premier verdict
  // laisserait une clé éternelle, donc un compte verrouillé pour toujours.
  it('renews the expiry on every call, not only when the counter is created', async () => {
    redisIncr.mockResolvedValue(7);

    await consumeLabelQuota(BY, 0);

    expect(redisExpire).toHaveBeenCalledWith(rateLimitKey(BY, 0), WINDOW_MS / 1000);
  });

  // Échoue ouvert : c'est redisAppend qui refusera l'écriture, et un verdict perdu ne se
  // rattrape pas.
  it('lets the request through when the counter cannot be read', async () => {
    redisIncr.mockRejectedValue(new Error('upstash down'));

    await expect(consumeLabelQuota(BY, 0)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  it('lets the request through when the window can no longer be guaranteed to reset', async () => {
    redisIncr.mockResolvedValue(LABEL_LIMIT + 1);
    redisExpire.mockRejectedValue(new Error('upstash down'));

    await expect(consumeLabelQuota(BY, 0)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });
});
