import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../route';

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
  vi.stubEnv('BLIZZARD_CLIENT_ID', 'test-id');
  vi.stubEnv('BLIZZARD_CLIENT_SECRET', 'test-secret');
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
    vi.stubEnv('BLIZZARD_CLIENT_ID', '');
    vi.stubEnv('BLIZZARD_CLIENT_SECRET', '');
    // No fetch mock needed — the error is thrown before any fetch

    const res = await GET(makeRequest('KR'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual([]);
  });
});
