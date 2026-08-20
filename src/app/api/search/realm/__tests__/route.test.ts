import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../route';

// Le garde de quota WCL a ses propres tests ; ici on le neutralise par défaut et on vérifie
// seulement qu'un refus de sa part sort avant la moindre dépense.
const { guardWclSpend } = vi.hoisted(() => ({ guardWclSpend: vi.fn(async () => null) }));

vi.mock('@/lib/api/wcl-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/wcl-guard')>()),
  guardWclSpend,
}));

function makeRequest(region?: string) {
  const url = region
    ? `http://localhost/api/search/realm?region=${region}`
    : 'http://localhost/api/search/realm';
  return { url } as NextRequest;
}

const tokenResponse = { access_token: 'test-token', expires_in: 3600 };
const realmIndex = {
  realms: [
    { id: 1, name: 'Zul-jin', slug: 'zul-jin' },
    { id: 2, name: 'Area 52', slug: 'area-52' },
  ],
};

beforeEach(() => {
  vi.stubEnv('BLIZZARD_CLIENT_ID_DEV', 'test-id');
  vi.stubEnv('BLIZZARD_CLIENT_SECRET_DEV', 'test-secret');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('search/realm route', () => {
  it('returns sorted realm list on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(tokenResponse) } as Response)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(realmIndex) } as Response)
    );

    const res = await GET(makeRequest('US'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual([
      { id: 2, name: 'Area 52', slug: 'area-52' },
      { id: 1, name: 'Zul-jin', slug: 'zul-jin' },
    ]);
  });

  it('defaults to EU when region param is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(tokenResponse) } as Response)
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(realmIndex) } as Response)
    );

    const fetchSpy = vi.mocked(globalThis.fetch);
    await GET(makeRequest());

    // Token may be cached from a prior test — use the last call, which is always the realm endpoint
    const realmUrl = fetchSpy.mock.calls.at(-1)?.[0] as string;
    expect(realmUrl).toContain('eu.api.blizzard.com');
  });

  it('returns empty array when Blizzard realm API fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(tokenResponse) } as Response)
        .mockResolvedValueOnce({ ok: false } as Response)
    );

    const res = await GET(makeRequest('EU'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual([]);
  });

  it('returns empty array when fetch throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(tokenResponse) } as Response)
        .mockRejectedValueOnce(new Error('Network error'))
    );

    const res = await GET(makeRequest('EU'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual([]);
  });

  it('returns empty array when Blizzard credentials are not configured', async () => {
    vi.stubEnv('BLIZZARD_CLIENT_ID_DEV', '');
    vi.stubEnv('BLIZZARD_CLIENT_SECRET_DEV', '');
    // Le jeton est mémorisé au niveau du module : sans ce rechargement, un test précédent
    // l'a déjà mis en cache et la route ne regarde jamais les identifiants — elle partait
    // alors appeler Blizzard pour de vrai.
    vi.resetModules();
    const { GET: freshGET } = await import('../route');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const res = await freshGET(makeRequest('KR'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// Sans ce test, retirer le garde d'une route ne casserait rien : c'est lui qui atteste que
// le refus sort avant le premier appel à Warcraft Logs.
describe('search/realm route under the WCL guard', () => {
  it('returns the guard refusal without spending anything', async () => {
    guardWclSpend.mockResolvedValueOnce(new Response(null, { status: 429 }) as unknown as null);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const res = await GET(makeRequest('EU'));

    expect(res.status).toBe(429);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
