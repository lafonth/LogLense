import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gql } from '@/lib/wcl/client';
import { GET } from '../route';

// Le garde de quota WCL a ses propres tests ; ici on le neutralise par défaut et on vérifie
// seulement qu'un refus de sa part sort avant la moindre dépense.
const { guardWclSpend } = vi.hoisted(() => ({ guardWclSpend: vi.fn(async () => null) }));

vi.mock('@/lib/api/wcl-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/wcl-guard')>()),
  guardWclSpend,
}));

vi.mock('@/lib/wcl/auth', () => ({
  getWCLToken: vi.fn().mockResolvedValue('mock-token'),
}));

vi.mock('@/lib/wcl/client', () => ({
  gql: vi.fn(),
}));

const gqlMock = vi.mocked(gql);

function makeRequest(_code: string) {
  return {} as NextRequest;
}

function makeParams(code: string) {
  return { params: Promise.resolve({ code }) };
}

const rawReport = {
  reportData: {
    report: {
      title: 'Tuesday Raid',
      fights: [
        {
          id: 1,
          name: 'Gallywix',
          encounterID: 3009,
          kill: true,
          startTime: 0,
          endTime: 180000,
          difficulty: 5,
        },
        {
          id: 2,
          name: 'Trash',
          encounterID: 0,
          kill: null,
          startTime: 180000,
          endTime: 190000,
          difficulty: 5,
        },
      ],
      masterData: {
        actors: [
          { id: 10, name: 'Jumbaa', type: 'Player', subType: 'Druid', server: 'Ysondre' },
          { id: 11, name: 'SomePet', type: 'Pet', subType: '', server: null },
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

describe('report/[code] route', () => {
  it('returns filtered meta on success', async () => {
    gqlMock.mockResolvedValue(rawReport);

    const res = await GET(makeRequest('abc123def456ghij'), makeParams('abc123def456ghij'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.title).toBe('Tuesday Raid');
    expect(json.fights).toHaveLength(1);
    expect(json.fights[0].encounterID).toBe(3009);
    expect(json.fights[0].kill).toBe(true);
    expect(json.actors).toHaveLength(1);
    expect(json.actors[0].name).toBe('Jumbaa');
  });

  it('returns 400 for invalid report code', async () => {
    const res = await GET(makeRequest('bad!code'), makeParams('bad!code'));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid report code/i);
  });

  it('returns 400 for short code', async () => {
    const res = await GET(makeRequest('abc'), makeParams('abc'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when report is not found', async () => {
    gqlMock.mockResolvedValue({ reportData: { report: null } });

    const res = await GET(makeRequest('abc123def456ghij'), makeParams('abc123def456ghij'));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/not found/i);
  });

  it('coerces null kill to false', async () => {
    const withNullKill = {
      reportData: {
        report: {
          ...rawReport.reportData.report,
          fights: [
            {
              id: 1,
              name: 'Gallywix',
              encounterID: 3009,
              kill: null,
              startTime: 0,
              endTime: 180000,
              difficulty: 5,
            },
          ],
        },
      },
    };
    gqlMock.mockResolvedValue(withNullKill);

    const res = await GET(makeRequest('abc123def456ghij'), makeParams('abc123def456ghij'));
    const json = await res.json();

    expect(json.fights[0].kill).toBe(false);
  });
});

// Sans ce test, retirer le garde d'une route ne casserait rien : c'est lui qui atteste que
// le refus sort avant le premier appel à Warcraft Logs.
describe('report/[code] route under the WCL guard', () => {
  it('returns the guard refusal without spending anything', async () => {
    guardWclSpend.mockResolvedValueOnce(new Response(null, { status: 429 }) as unknown as null);

    const res = await GET(makeRequest('abc123def456ghij'), makeParams('abc123def456ghij'));

    expect(res.status).toBe(429);
    expect(gqlMock).not.toHaveBeenCalled();
  });
});
