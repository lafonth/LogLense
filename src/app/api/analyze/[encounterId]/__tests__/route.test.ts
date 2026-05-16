import type { BossResult } from '@/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeBoss } from '@/lib/wcl/pipeline';
import { POST } from '../route';

vi.mock('@/lib/wcl/auth', () => ({
  getWCLToken: vi.fn().mockResolvedValue('mock-token'),
}));

vi.mock('@/lib/wcl/pipeline', () => ({
  analyzeBoss: vi.fn(),
}));

const mockBossResult: BossResult = {
  encounter: 'Chimaerus',
  encounterId: 3306,
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
  },
  topPlayers: [],
};

function makeRequest(body: Record<string, unknown>, encounterId = '3306') {
  return new Request(`http://localhost/api/analyze/${encounterId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ specId: 103, ...body }),
  });
}

describe('analyze route', () => {
  beforeEach(() => {
    vi.mocked(analyzeBoss).mockResolvedValue(mockBossResult);
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
});
