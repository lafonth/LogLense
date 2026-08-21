import type { NextRequest } from 'next/server';
import type { PullComparisonResult, PullPointer } from '@/lib/wcl/pull-pipeline';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordPullComparison } from '@/lib/labels/record-pull-comparison';
import { getWCLToken } from '@/lib/wcl/auth';
import { fetchPullComparison } from '@/lib/wcl/pull-pipeline';
import { POST } from '../route';

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

vi.mock('@/lib/wcl/pull-pipeline', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/wcl/pull-pipeline')>()),
  fetchPullComparison: vi.fn(),
}));

vi.mock('@/lib/labels/record-pull-comparison', () => ({
  recordPullComparison: vi.fn().mockResolvedValue(undefined),
}));

function pointer(over: Partial<PullPointer> = {}): PullPointer {
  return {
    code: 'abc',
    fightId: 17,
    actorId: 63,
    name: 'Jumbaa',
    fightMs: 180000,
    encounterId: 3306,
    difficulty: 5,
    ...over,
  };
}

const snapshot = {
  code: 'abc',
  fightId: 17,
  actorId: 63,
  name: 'Jumbaa',
  fightMs: 180000,
  stats: { name: 'Jumbaa', avgIlvl: 635, talents: {} },
  rotation: { name: 'Jumbaa', dps: 250000, fightDurationMs: 180000, casts: {}, buffs: {} },
  damageEntries: [],
  dps: 250000,
  eligibility: { tierPieces: 4, externalUptime: 0, externals: [] },
  context: { deaths: 0, subjectDied: false, subjectDeathMs: null, wipesBefore: 0 },
};

const mockResult: PullComparisonResult = {
  before: snapshot as never,
  after: { ...snapshot, fightId: 18 } as never,
  comparison: {
    delta: { dpsDelta: 5000 },
  } as never,
};

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/pull-comparison', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    specId: 103,
    before: pointer(),
    after: pointer({ fightId: 18 }),
    ...overrides,
  };
}

describe('pull-comparison route', () => {
  beforeEach(() => {
    vi.mocked(fetchPullComparison).mockReset().mockResolvedValue(mockResult);
    vi.mocked(recordPullComparison).mockReset().mockResolvedValue(undefined);
    guardWclSpend.mockReset().mockResolvedValue(null);
    process.env.WCL_CLIENT_ID = 'test-id';
    process.env.WCL_CLIENT_SECRET = 'test-secret';
  });

  it('returns the compared pulls', async () => {
    const res = await POST(makeRequest(validBody()));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.comparison.delta.dpsDelta).toBe(5000);
  });

  it('returns 400 when a pointer is incomplete', async () => {
    const res = await POST(makeRequest(validBody({ before: pointer({ code: '' }) })));

    expect(res.status).toBe(400);
    expect(fetchPullComparison).not.toHaveBeenCalled();
  });

  it('returns 400 when specId is missing', async () => {
    const res = await POST(makeRequest(validBody({ specId: undefined })));

    expect(res.status).toBe(400);
    expect(fetchPullComparison).not.toHaveBeenCalled();
  });

  it('returns 500 when WCL credentials are missing', async () => {
    delete process.env.WCL_CLIENT_ID;
    delete process.env.WCL_CLIENT_SECRET;

    const res = await POST(makeRequest(validBody()));
    expect(res.status).toBe(500);
  });

  it('returns 404 when the pull cannot be resolved, without capturing anything', async () => {
    vi.mocked(fetchPullComparison).mockResolvedValue(null);

    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(404);
    expect(recordPullComparison).not.toHaveBeenCalled();
  });

  it('records the compared pair with the right pointers and spec', async () => {
    await POST(makeRequest(validBody()));

    expect(recordPullComparison).toHaveBeenCalledWith(
      expect.objectContaining({ fightId: 17 }),
      expect.objectContaining({ fightId: 18 }),
      103
    );
  });

  it('still renders the comparison if the capture were to reject', async () => {
    vi.mocked(recordPullComparison).mockRejectedValue(new Error('redis down'));

    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(200);
  });
});

// Sans ce test, retirer le garde d'une route ne casserait rien : c'est lui qui atteste que
// le refus sort avant le premier appel à Warcraft Logs.
describe('pull-comparison route under the WCL guard', () => {
  it('returns the guard refusal without spending anything', async () => {
    vi.mocked(fetchPullComparison).mockClear();
    guardWclSpend.mockResolvedValueOnce(new Response(null, { status: 429 }) as unknown as null);

    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(429);
    expect(fetchPullComparison).not.toHaveBeenCalled();
  });
});

// C2 mot pour mot, sur une route écrite après C2 : le quota était débité avant le contrôle
// des identifiants, et rien n'était dans un `try`. Ces trois tests figent le correctif.
describe('pull-comparison route sur la forme de zones', () => {
  beforeEach(() => {
    vi.mocked(fetchPullComparison).mockReset().mockResolvedValue(mockResult);
    vi.mocked(getWCLToken).mockReset().mockResolvedValue('mock-token');
    guardWclSpend.mockReset().mockResolvedValue(null);
    process.env.WCL_CLIENT_ID = 'test-id';
    process.env.WCL_CLIENT_SECRET = 'test-secret';
  });

  it('ne prélève aucun quota quand les identifiants manquent', async () => {
    delete process.env.WCL_CLIENT_ID;
    delete process.env.WCL_CLIENT_SECRET;

    const res = await POST(makeRequest(validBody()));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toMatch(/credentials/i);
    expect(guardWclSpend).not.toHaveBeenCalled();
    expect(fetchPullComparison).not.toHaveBeenCalled();
  });

  it('rend 500 avec le message quand Warcraft Logs échoue', async () => {
    vi.mocked(fetchPullComparison).mockRejectedValue(new Error('WCL rate limit'));

    const res = await POST(makeRequest(validBody()));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('WCL rate limit');
  });

  it('rend 500 quand le jeton lui-même échoue, sans exception non capturée', async () => {
    vi.mocked(getWCLToken).mockRejectedValueOnce(new Error('token refused'));

    const res = await POST(makeRequest(validBody()));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.error).toBe('token refused');
    expect(fetchPullComparison).not.toHaveBeenCalled();
  });
});
