import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTokenCache } from '../auth';
import { gql, parseRetryAfter, retryDelayMs, WCLError } from '../client';

vi.mock('../auth', () => ({ clearTokenCache: vi.fn() }));

/** Aucune attente réelle : les délais sont vérifiés sur `retryDelayMs`, pas sur l'horloge. */
const NO_WAIT = { attempts: 3, baseDelayMs: 0, maxDelayMs: 0 };

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function fail(status: number, retryAfter?: string) {
  return {
    ok: false,
    status,
    headers: { get: (name: string) => (name === 'Retry-After' ? (retryAfter ?? null) : null) },
  } as unknown as Response;
}

describe('gql', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(clearTokenCache).mockClear();
  });

  it('returns data on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(ok({ data: { worldData: { encounter: {} } } }));

    const result = await gql<{ worldData: unknown }>('token', '{ worldData { encounter } }');
    expect(result).toEqual({ worldData: { encounter: {} } });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://www.warcraftlogs.com/api/v2/client',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      })
    );
  });

  // Sans borne, une requête qui ne revient pas tient la route ouverte jusqu'au délai de la
  // plateforme : ni résultat, ni erreur.
  it('bounds every attempt with an abort signal', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(ok({ data: {} }));
    await gql('token', 'query {}');

    const init = vi.mocked(globalThis.fetch).mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('throws on GraphQL errors array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(ok({ errors: [{ message: 'Not found' }] }));

    await expect(gql('token', 'query {}')).rejects.toThrow('WCL GraphQL error');
  });

  // Une erreur GraphQL sort avec un 200 : la rejouer donnerait la même erreur.
  it('does not retry a GraphQL error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(ok({ errors: [{ message: 'Not found' }] }));

    await expect(gql('token', 'query {}', undefined, NO_WAIT)).rejects.toThrow();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  // Dix pages de classement partant ensemble, le 429 est le régime normal — pas une panne.
  it.each([429, 500, 503])('retries a %d and returns the eventual success', async (status) => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(fail(status))
      .mockResolvedValueOnce(ok({ data: { fine: true } }));

    await expect(gql('token', 'query {}', undefined, NO_WAIT)).resolves.toEqual({ fine: true });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('gives up after the configured number of attempts', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(fail(429));

    const err = await gql('token', 'query {}', undefined, NO_WAIT).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WCLError);
    expect(err).toMatchObject({ status: 429, attempts: 3 });
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  // Rejouer un 404 ou un 403 ne le corrigerait pas : ce serait dépenser la clé pour rien.
  it.each([400, 403, 404])('does not retry a %d', async (status) => {
    globalThis.fetch = vi.fn().mockResolvedValue(fail(status));

    await expect(gql('token', 'query {}', undefined, NO_WAIT)).rejects.toThrow(
      `WCL request failed: ${status}`
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  // Le jeton en cache a expiré avant sa date : le vider rend la requête suivante possible.
  it('drops the cached token on 401', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(fail(401));

    await expect(gql('token', 'query {}', undefined, NO_WAIT)).rejects.toThrow();
    expect(clearTokenCache).toHaveBeenCalledTimes(1);
  });

  it('leaves the cached token alone on any other status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(fail(404));

    await expect(gql('token', 'query {}', undefined, NO_WAIT)).rejects.toThrow();
    expect(clearTokenCache).not.toHaveBeenCalled();
  });

  // Une requête qui n'a pas abouti n'a rien lu et rien coûté : la reprendre est sans risque.
  it('retries a network failure', async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('The operation was aborted due to timeout'))
      .mockResolvedValueOnce(ok({ data: { fine: true } }));

    await expect(gql('token', 'query {}', undefined, NO_WAIT)).resolves.toEqual({ fine: true });
  });

  it('reports a network failure as a WCLError without a status', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fetch failed'));

    const err = await gql('token', 'query {}', undefined, NO_WAIT).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WCLError);
    expect(err).toMatchObject({ status: null, attempts: 3 });
  });
});

describe('parseRetryAfter', () => {
  it('reads a delay in seconds', () => {
    expect(parseRetryAfter('30')).toBe(30_000);
  });

  it('reads an HTTP date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    expect(parseRetryAfter('Thu, 01 Jan 2026 00:00:20 GMT')).toBe(20_000);
    vi.useRealTimers();
  });

  // Une date déjà passée n'autorise pas une attente négative.
  it('floors a past date at zero', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:01:00Z'));
    expect(parseRetryAfter('Thu, 01 Jan 2026 00:00:00 GMT')).toBe(0);
    vi.useRealTimers();
  });

  it.each([null, '', 'soon', '-5'])('treats %s as absent', (header) => {
    expect(parseRetryAfter(header)).toBeNull();
  });
});

describe('retryDelayMs', () => {
  const policy = { attempts: 3, baseDelayMs: 500, maxDelayMs: 8_000 };

  it('doubles at each attempt', () => {
    expect(retryDelayMs(1, null, policy)).toBe(500);
    expect(retryDelayMs(2, null, policy)).toBe(1000);
    expect(retryDelayMs(3, null, policy)).toBe(2000);
  });

  // Revenir avant l'heure demandée, c'est se faire refuser une fois de plus.
  it('never comes back sooner than the server asked', () => {
    expect(retryDelayMs(1, '3', policy)).toBe(3000);
  });

  it('keeps the backoff when the server asks for less', () => {
    expect(retryDelayMs(3, '1', policy)).toBe(2000);
  });

  it('caps whatever the server asks for', () => {
    expect(retryDelayMs(1, '600', policy)).toBe(8_000);
  });
});
