import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWCLToken } from '@/lib/wcl/auth';
import { gql } from '@/lib/wcl/client';
import { GET } from '../route';

const { guardWclSpend } = vi.hoisted(() => ({ guardWclSpend: vi.fn(async () => null) }));
const { recordIntraRaid } = vi.hoisted(() => ({ recordIntraRaid: vi.fn(async () => {}) }));

vi.mock('@/lib/api/wcl-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/wcl-guard')>()),
  guardWclSpend,
}));

vi.mock('@/lib/labels/record-intra-raid', () => ({ recordIntraRaid }));

vi.mock('@/lib/wcl/auth', () => ({ getWCLToken: vi.fn().mockResolvedValue('mock-token') }));

vi.mock('@/lib/wcl/client', () => ({ gql: vi.fn() }));

const gqlMock = vi.mocked(gql);

const CODE = 'abcdefgh12345678';

function makeRequest(fight: string | null) {
  return {
    nextUrl: { searchParams: new URLSearchParams(fight === null ? '' : `fight=${fight}`) },
  } as NextRequest;
}

function makeParams(code: string) {
  return { params: Promise.resolve({ code }) };
}

const rawRanking = {
  reportData: {
    report: {
      rankings: {
        data: [
          {
            roles: {
              dps: {
                characters: [
                  { name: 'Fury', amount: 2000, rankPercent: 90, spec: 'Fury', class: 'Warrior' },
                  { name: 'Arms', amount: 1000, rankPercent: 40, spec: 'Arms', class: 'Warrior' },
                ],
              },
            },
          },
        ],
      },
      table: {
        data: {
          entries: [
            { id: 1, name: 'Arms', total: 300_000, type: 'Warrior', icon: 'Warrior-Arms' },
            { id: 2, name: 'Fury', total: 600_000, type: 'Warrior', icon: 'Warrior-Fury' },
          ],
        },
      },
      events: { data: [] },
      fights: [
        {
          id: 42,
          name: 'Fyrakk the Blazing',
          encounterID: 2677,
          kill: true,
          difficulty: 5,
          startTime: 0,
          endTime: 300_000,
        },
      ],
      masterData: {
        actors: [
          { id: 1, name: 'Arms', subType: 'Warrior' },
          { id: 2, name: 'Fury', subType: 'Warrior' },
        ],
      },
    },
  },
};

beforeEach(() => {
  vi.stubEnv('WCL_CLIENT_ID', 'test-id');
  vi.stubEnv('WCL_CLIENT_SECRET', 'test-secret');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('raid/[code] route', () => {
  it('rend le classement, son axe, et capture avant de répondre', async () => {
    gqlMock.mockResolvedValue(rawRanking);

    const res = await GET(makeRequest('42'), makeParams(CODE));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.criterion).toBe('percentile');
    expect(json.criterionReason).toBeTruthy();
    expect(json.players.map((p: { name: string }) => p.name)).toEqual(['Arms', 'Fury']);
    // Attendue, pas laissée en `void` : une promesse en vol meurt avec la fonction.
    expect(recordIntraRaid).toHaveBeenCalledWith(expect.objectContaining({ code: CODE }));
  });

  it('refuse un code invalide sans rien dépenser', async () => {
    const res = await GET(makeRequest('42'), makeParams('bad!code'));
    expect(res.status).toBe(400);
    expect(gqlMock).not.toHaveBeenCalled();
  });

  it('refuse une pull absente de la requête', async () => {
    const res = await GET(makeRequest(null), makeParams(CODE));
    expect(res.status).toBe(400);
    expect(gqlMock).not.toHaveBeenCalled();
  });

  it('rend 404 quand la pull n’est pas dans le rapport', async () => {
    gqlMock.mockResolvedValue({ reportData: { report: null } });

    const res = await GET(makeRequest('42'), makeParams(CODE));
    expect(res.status).toBe(404);
  });

  it('rend 502 quand Warcraft Logs échoue', async () => {
    gqlMock.mockRejectedValue(new Error('boom'));

    const res = await GET(makeRequest('42'), makeParams(CODE));
    expect(res.status).toBe(502);
  });

  it('une capture qui échoue ne coûte pas la réponse', async () => {
    gqlMock.mockResolvedValue(rawRanking);
    recordIntraRaid.mockRejectedValueOnce(new Error('redis down'));

    const res = await GET(makeRequest('42'), makeParams(CODE));
    expect(res.status).toBe(200);
  });
});

// Sans ce test, retirer le garde ne casserait rien.
describe('raid/[code] route sous le garde WCL', () => {
  it('rend le refus sans dépenser', async () => {
    guardWclSpend.mockResolvedValueOnce(new Response(null, { status: 429 }) as unknown as null);

    const res = await GET(makeRequest('42'), makeParams(CODE));

    expect(res.status).toBe(429);
    expect(gqlMock).not.toHaveBeenCalled();
  });
});

// C2 disait : identifiants d'abord, quota ensuite, et rien hors du `try`. Le 502 est le
// seul écart assumé avec `zones/route.ts` — l'amont a échoué, pas nous.
describe('raid/[code] route sur la forme de zones', () => {
  it('rend 500 sans rien prélever quand les identifiants manquent', async () => {
    vi.stubEnv('WCL_CLIENT_ID', '');

    const res = await GET(makeRequest('42'), makeParams(CODE));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toMatch(/credentials/i);
    expect(guardWclSpend).not.toHaveBeenCalled();
    expect(gqlMock).not.toHaveBeenCalled();
  });

  it('rend 502 quand le jeton lui-même échoue, sans exception non capturée', async () => {
    vi.mocked(getWCLToken).mockRejectedValueOnce(new Error('token refused'));

    const res = await GET(makeRequest('42'), makeParams(CODE));
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error).toBeTruthy();
    expect(gqlMock).not.toHaveBeenCalled();
  });
});
