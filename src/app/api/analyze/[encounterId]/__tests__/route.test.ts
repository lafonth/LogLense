import type { BossResult } from '@/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordExposure } from '@/lib/labels/record-exposure';
import { analyzeBoss } from '@/lib/wcl/pipeline';
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

vi.mock('@/lib/wcl/pipeline', () => ({
  analyzeBoss: vi.fn(),
}));

vi.mock('@/lib/labels/record-exposure', () => ({
  recordExposure: vi.fn().mockResolvedValue(undefined),
}));

const mockBossResult: BossResult = {
  renderId: 'render-1',
  encounter: 'Chimaerus',
  encounterId: 3306,
  specId: 103,
  difficulty: 5,
  fightTargets: [],
  character: {
    stats: {
      name: 'Jumbaa',
      avgIlvl: 635,
      primaryStat: 13200,
      crit: 3890,
      haste: 3500,
      mastery: 5800,
      vers: 750,
      talents: {},
    },
    rotation: {
      name: 'Jumbaa',
      dps: 250000,
      fightDurationMs: 180000,
      casts: {},
      buffs: {},
      opening: [],
    },
    damageTable: { entries: [] },
    dps: 250000,
    bossDps: null,
    killTime: '3:00',
    overallPct: 95.5,
    overallPctOf: 1000,
    todayPct: 92.1,
    bossDpsPct: null,
    bracket: 0,
    source: { code: 'abc', fightID: 17, actorId: 63 },
    trajectory: [],
    eligibility: { tierPieces: 4, externalUptime: 0, externals: [] },
    context: null,
  },
  topPlayers: [],
  sample: [],
  comparability: {
    level: 'close',
    referenceIlvl: 636,
    myIlvl: 635,
    referenceKillTimeMs: 178000,
    myKillTimeMs: 180000,
    candidatesConsidered: 500,
    pagesFetched: 5,
    disqualified: 0,
    unverifiable: 0,
    substituted: 0,
  },
};

function makeRequest(body: Record<string, unknown>, encounterId = '3306') {
  return new Request(`http://localhost/api/analyze/${encounterId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('analyze route', () => {
  beforeEach(() => {
    vi.mocked(analyzeBoss).mockResolvedValue(mockBossResult);
    vi.mocked(recordExposure).mockReset().mockResolvedValue(undefined);
    process.env.WCL_CLIENT_ID = 'test-id';
    process.env.WCL_CLIENT_SECRET = 'test-secret';
  });

  it('returns BossResult on success', async () => {
    const req = makeRequest({
      characterName: 'Jumbaa',
      serverSlug: 'ysondre',
      region: 'EU',
      difficulty: 5,
      encounterName: 'Chimaerus',
      specId: 103,
    });

    const res = await POST(req, { params: Promise.resolve({ encounterId: '3306' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.encounter).toBe('Chimaerus');
    expect(body.character.dps).toBe(250000);
  });

  it('returns null when analyzeBoss returns null (no data)', async () => {
    vi.mocked(analyzeBoss).mockResolvedValue(null);

    const req = makeRequest({
      characterName: 'NoData',
      serverSlug: 'ysondre',
      region: 'EU',
      difficulty: 5,
      encounterName: 'Chimaerus',
      specId: 103,
    });

    const res = await POST(req, { params: Promise.resolve({ encounterId: '3306' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toBeNull();
  });

  it('returns 400 for non-numeric encounterId', async () => {
    const req = makeRequest(
      {
        characterName: 'Jumbaa',
        serverSlug: 'ysondre',
        region: 'EU',
        difficulty: 5,
        encounterName: 'X',
        specId: 103,
      },
      'not-a-number'
    );

    const res = await POST(req, { params: Promise.resolve({ encounterId: 'not-a-number' }) });
    expect(res.status).toBe(400);
  });

  it('returns 400 when specId is missing', async () => {
    const req = makeRequest({
      characterName: 'Jumbaa',
      serverSlug: 'ysondre',
      region: 'EU',
      difficulty: 5,
      encounterName: 'Chimaerus',
    });

    const res = await POST(req, { params: Promise.resolve({ encounterId: '3306' }) });
    expect(res.status).toBe(400);
  });

  // Une région ou une difficulté hors domaine partait chez WCL et s'y faisait refuser :
  // la dépense était engagée sous la clé du produit pour un corps qu'on savait invalide.
  it('returns 400 for a region or a difficulty outside the domain, without spending', async () => {
    vi.mocked(analyzeBoss).mockClear();

    const base = {
      characterName: 'Jumbaa',
      serverSlug: 'ysondre',
      region: 'EU',
      difficulty: 5,
      encounterName: 'Chimaerus',
      specId: 103,
    };
    const params = { params: Promise.resolve({ encounterId: '3306' }) };

    const badRegion = await POST(makeRequest({ ...base, region: 'XX' }), params);
    const badDifficulty = await POST(makeRequest({ ...base, difficulty: 9 }), params);

    expect(badRegion.status).toBe(400);
    expect(badDifficulty.status).toBe(400);
    expect(vi.mocked(analyzeBoss)).not.toHaveBeenCalled();
  });

  it('returns 400 rather than 500 on a body that is not JSON', async () => {
    const req = new Request('http://localhost/api/analyze/3306', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not json',
    });

    const res = await POST(req, { params: Promise.resolve({ encounterId: '3306' }) });
    expect(res.status).toBe(400);
  });

  it('returns 500 when WCL credentials are missing', async () => {
    delete process.env.WCL_CLIENT_ID;
    delete process.env.WCL_CLIENT_SECRET;

    const req = makeRequest({
      characterName: 'Jumbaa',
      serverSlug: 'ysondre',
      region: 'EU',
      difficulty: 5,
      encounterName: 'Chimaerus',
      specId: 103,
    });

    const res = await POST(req, { params: Promise.resolve({ encounterId: '3306' }) });
    expect(res.status).toBe(500);
  });

  it('returns 500 when analyzeBoss throws', async () => {
    vi.mocked(analyzeBoss).mockRejectedValue(new Error('WCL rate limit'));

    const req = makeRequest({
      characterName: 'Jumbaa',
      serverSlug: 'ysondre',
      region: 'EU',
      difficulty: 5,
      encounterName: 'Chimaerus',
      specId: 103,
    });

    const res = await POST(req, { params: Promise.resolve({ encounterId: '3306' }) });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('WCL rate limit');
  });

  // La capture est le seul actif que ce produit ne peut pas reconstituer plus tard : elle
  // part avec la réponse, et elle dit de quelle mesure le DPS du sujet provient.
  it('records the exposure of what it is about to render', async () => {
    const req = makeRequest({
      characterName: 'Jumbaa',
      serverSlug: 'ysondre',
      region: 'EU',
      difficulty: 5,
      encounterName: 'Chimaerus',
      specId: 103,
    });

    const res = await POST(req, { params: Promise.resolve({ encounterId: '3306' }) });
    const body = await res.json();

    expect(recordExposure).toHaveBeenCalledTimes(1);
    expect(recordExposure).toHaveBeenCalledWith([mockBossResult], { dpsSource: 'ranking' });
    // La réponse ne change pas : la capture s'ajoute au rendu, elle ne le reformule pas.
    expect(body.encounter).toBe('Chimaerus');
  });

  it('records nothing when there is no analysis to show', async () => {
    vi.mocked(analyzeBoss).mockResolvedValue(null);

    const req = makeRequest({
      characterName: 'NoData',
      serverSlug: 'ysondre',
      region: 'EU',
      difficulty: 5,
      encounterName: 'Chimaerus',
      specId: 103,
    });

    await POST(req, { params: Promise.resolve({ encounterId: '3306' }) });

    expect(recordExposure).toHaveBeenCalledWith([], { dpsSource: 'ranking' });
  });

  // `recordExposure` avale ses propres échecs ; si l'un lui échappait quand même, il ne doit
  // pas transformer une analyse réussie en 500.
  it('still renders the analysis if the capture were to reject', async () => {
    vi.mocked(recordExposure).mockRejectedValue(new Error('redis down'));

    const req = makeRequest({
      characterName: 'Jumbaa',
      serverSlug: 'ysondre',
      region: 'EU',
      difficulty: 5,
      encounterName: 'Chimaerus',
      specId: 103,
    });

    const res = await POST(req, { params: Promise.resolve({ encounterId: '3306' }) });

    expect(res.status).toBe(200);
    expect((await res.json()).encounter).toBe('Chimaerus');
  });
});

// Sans ce test, retirer le garde d'une route ne casserait rien : c'est lui qui atteste que
// le refus sort avant le premier appel à Warcraft Logs.
describe('analyze route under the WCL guard', () => {
  it('returns the guard refusal without spending anything', async () => {
    guardWclSpend.mockResolvedValueOnce(new Response(null, { status: 429 }) as unknown as null);
    vi.mocked(analyzeBoss).mockClear();

    const res = await POST(
      makeRequest({
        characterName: 'Jumbaa',
        serverSlug: 'ysondre',
        region: 'EU',
        difficulty: 5,
        encounterName: 'Chimaerus',
        specId: 103,
      }),
      { params: Promise.resolve({ encounterId: '3306' }) }
    );

    expect(res.status).toBe(429);
    expect(vi.mocked(analyzeBoss)).not.toHaveBeenCalled();
  });
});
