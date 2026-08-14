import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_LIMIT,
  AI_PREFIX,
  consumeAiQuota,
  consumeLabelQuota,
  consumeWclQuota,
  LABEL_LIMIT,
  quotaKey,
  rateLimitKey,
  WCL_PREFIX,
  WCL_UNIT_LIMIT,
  WINDOW_MS,
} from '../rate-limit';

const { redisIncrBy, redisExpire } = vi.hoisted(() => ({
  redisIncrBy: vi.fn(),
  redisExpire: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({ redisIncrBy, redisExpire }));

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
    redisIncrBy.mockResolvedValue(LABEL_LIMIT);

    await expect(consumeLabelQuota(BY, 0)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  it('refuses the one past it and points at the next window', async () => {
    redisIncrBy.mockResolvedValue(LABEL_LIMIT + 1);

    const verdict = await consumeLabelQuota(BY, WINDOW_MS / 2);

    expect(verdict.allowed).toBe(false);
    expect(verdict.retryAfterSeconds).toBe(WINDOW_MS / 2000);
  });

  // La durée de vie est posée à chaque appel : un EXPIRE manqué au premier verdict
  // laisserait une clé éternelle, donc un compte verrouillé pour toujours.
  it('renews the expiry on every call, not only when the counter is created', async () => {
    redisIncrBy.mockResolvedValue(7);

    await consumeLabelQuota(BY, 0);

    expect(redisExpire).toHaveBeenCalledWith(rateLimitKey(BY, 0), WINDOW_MS / 1000);
  });

  // Échoue ouvert : c'est redisAppend qui refusera l'écriture, et un verdict perdu ne se
  // rattrape pas.
  it('lets the request through when the counter cannot be read', async () => {
    redisIncrBy.mockRejectedValue(new Error('upstash down'));

    await expect(consumeLabelQuota(BY, 0)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });

  it('lets the request through when the window can no longer be guaranteed to reset', async () => {
    redisIncrBy.mockResolvedValue(LABEL_LIMIT + 1);
    redisExpire.mockRejectedValue(new Error('upstash down'));

    await expect(consumeLabelQuota(BY, 0)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });
});

describe('consumeAiQuota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisExpire.mockResolvedValue(undefined);
  });

  it('counts on its own key, so saturating the labels does not close the AI', async () => {
    redisIncrBy.mockResolvedValue(1);

    await consumeAiQuota(BY, 0);

    expect(redisIncrBy).toHaveBeenCalledWith(quotaKey(AI_PREFIX, BY, 0), 1);
  });

  it('lets the last report of the quota through', async () => {
    redisIncrBy.mockResolvedValue(AI_LIMIT);

    await expect(consumeAiQuota(BY, 0)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0,
      unavailable: false,
      consumed: AI_LIMIT,
    });
  });

  it('refuses the one past it and points at the next window', async () => {
    redisIncrBy.mockResolvedValue(AI_LIMIT + 1);

    const verdict = await consumeAiQuota(BY, WINDOW_MS / 2);

    expect(verdict).toEqual({
      allowed: false,
      retryAfterSeconds: WINDOW_MS / 2000,
      unavailable: false,
      consumed: AI_LIMIT + 1,
    });
  });

  // L'inverse exact de `consumeQuota` : là une donnée perdue, ici une dépense sans plafond.
  it('refuses when the counter cannot be read, and says why', async () => {
    redisIncrBy.mockRejectedValue(new Error('upstash down'));

    const verdict = await consumeAiQuota(BY, 0);

    expect(verdict.allowed).toBe(false);
    expect(verdict.unavailable).toBe(true);
  });

  it('refuses when the window can no longer be guaranteed to reset', async () => {
    redisIncrBy.mockResolvedValue(1);
    redisExpire.mockRejectedValue(new Error('upstash down'));

    const verdict = await consumeAiQuota(BY, 0);

    expect(verdict.allowed).toBe(false);
    expect(verdict.unavailable).toBe(true);
  });
});

describe('consumeWclQuota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisExpire.mockResolvedValue(undefined);
    redisIncrBy.mockResolvedValue(1);
  });

  // Le point du quota pondéré : une requête HTTP peut valoir cinquante appels chez WCL.
  // Compter les requêtes plafonnerait ce qu'on reçoit, pas ce qu'on dépense.
  it('charges the units the caller declares, on its own counter', async () => {
    await consumeWclQuota(BY, 0, 50);

    expect(redisIncrBy).toHaveBeenCalledWith(quotaKey(WCL_PREFIX, BY, 0), 50);
  });

  it('refuses a request whose cost overshoots the ceiling, even from under it', async () => {
    redisIncrBy.mockResolvedValue(WCL_UNIT_LIMIT + 50);

    const verdict = await consumeWclQuota(BY, 0, 50);

    expect(verdict.allowed).toBe(false);
    expect(verdict.unavailable).toBe(false);
  });

  // Strict comme le quota IA : une dépense non comptée est une dépense sans plafond, et la
  // sanction d'en face porte sur la clé du produit entier.
  it('refuses when the counter cannot be read', async () => {
    redisIncrBy.mockRejectedValue(new Error('upstash down'));

    const verdict = await consumeWclQuota(BY, 0, 50);

    expect(verdict.allowed).toBe(false);
    expect(verdict.unavailable).toBe(true);
  });

  // `consumed` n'existe que pour être agrégé en distribution de demande : ce que le compteur
  // totalise sur la fenêtre, cette requête comprise. Les quatre chemins de retour le portent,
  // sans quoi la courbe se lit sur un échantillon dont on ignore lesquels manquent.
  it('reports what the window totals, this request included, when it allows', async () => {
    redisIncrBy.mockResolvedValue(140);

    await expect(consumeWclQuota(BY, 0, 50)).resolves.toMatchObject({
      allowed: true,
      consumed: 140,
    });
  });

  it('reports what the window totals when it refuses', async () => {
    redisIncrBy.mockResolvedValue(WCL_UNIT_LIMIT + 50);

    await expect(consumeWclQuota(BY, 0, 50)).resolves.toMatchObject({
      allowed: false,
      consumed: WCL_UNIT_LIMIT + 50,
    });
  });

  // `null`, et non `0` : rien n'a été lu, donc rien n'est su. Un coût réellement nul est
  // représentable — `guardWclSpend` facturera un jour moins cher une analyse servie par le
  // cache — et confondre les deux fausserait la seule courbe qu'on cherche à lire.
  it('reports nothing measured, not a zero, when the increment never answered', async () => {
    redisIncrBy.mockRejectedValue(new Error('upstash down'));

    await expect(consumeWclQuota(BY, 0, 50)).resolves.toMatchObject({
      unavailable: true,
      consumed: null,
    });
  });

  // L'incrément, lui, a répondu : le relevé est vrai, et le jeter parce que la commande
  // *suivante* a échoué perdrait une donnée qu'on tient déjà. C'est `unavailable` qui dit que
  // le verdict n'est pas garanti, pas `consumed`.
  it('keeps the reading it already holds when only the expiry fails', async () => {
    redisIncrBy.mockResolvedValue(310);
    redisExpire.mockRejectedValue(new Error('upstash down'));

    await expect(consumeWclQuota(BY, 0, 50)).resolves.toMatchObject({
      allowed: false,
      unavailable: true,
      consumed: 310,
    });
  });
});
