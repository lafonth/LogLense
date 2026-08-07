import type { NextRequest } from 'next/server';
import type { BossResult } from '@/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordExposure } from '@/lib/labels/record-exposure';
import { analyzeReportBoss } from '@/lib/wcl/report-pipeline';
import { POST } from '../route';

vi.mock('@/lib/wcl/auth', () => ({
  getWCLToken: vi.fn().mockResolvedValue('mock-token'),
}));

vi.mock('@/lib/wcl/report-pipeline', () => ({
  analyzeReportBoss: vi.fn(),
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
    overallPct: null,
    overallPctOf: null,
    todayPct: null,
    bossDpsPct: null,
    bracket: null,
    source: { code: 'abc', fightID: 17, actorId: 63 },
    trajectory: [],
    eligibility: { tierPieces: 4, externalUptime: 0, externals: [] },
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
    substituted: 0,
  },
};

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/report/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    code: 'abc',
    actorId: 63,
    actorName: 'Jumbaa',
    actorClass: 'Druid',
    specId: 103,
    difficulty: 5,
    encounters: [{ id: 3306, name: 'Chimaerus', fightId: 17, fightMs: 180000 }],
    ...overrides,
  };
}

describe('report analyze route', () => {
  beforeEach(() => {
    vi.mocked(analyzeReportBoss).mockResolvedValue(mockBossResult);
    vi.mocked(recordExposure).mockReset().mockResolvedValue(undefined);
    process.env.WCL_CLIENT_ID = 'test-id';
    process.env.WCL_CLIENT_SECRET = 'test-secret';
  });

  it('returns the analysed bosses', async () => {
    const res = await POST(makeRequest(validBody()));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.bosses).toHaveLength(1);
    expect(body.bosses[0].encounter).toBe('Chimaerus');
  });

  it('returns 400 when the report pointer is incomplete', async () => {
    const res = await POST(makeRequest(validBody({ code: '' })));
    expect(res.status).toBe(400);
    expect(recordExposure).not.toHaveBeenCalled();
  });

  // Le chemin rapport ne mesure pas le DPS comme le chemin personnage : il le calcule depuis
  // la table de dégâts. Le corpus doit porter laquelle des deux mesures il tient.
  it('records the exposure with the damage-table provenance', async () => {
    const res = await POST(makeRequest(validBody()));
    const body = await res.json();

    expect(recordExposure).toHaveBeenCalledTimes(1);
    expect(recordExposure).toHaveBeenCalledWith([mockBossResult], { dpsSource: 'damage-table' });
    // La réponse est inchangée par la capture.
    expect(body.bosses[0].renderId).toBe('render-1');
  });

  // Un boss dont l'analyse a échoué est `null` : `recordExposure` reçoit le lot tel quel et
  // décide seul de ce qu'il y a à écrire — la route ne trie pas à sa place.
  it('passes the failed bosses through as null', async () => {
    vi.mocked(analyzeReportBoss).mockResolvedValue(null);

    await POST(makeRequest(validBody()));

    expect(recordExposure).toHaveBeenCalledWith([null], { dpsSource: 'damage-table' });
  });

  it('still renders the analysis if the capture were to reject', async () => {
    vi.mocked(recordExposure).mockRejectedValue(new Error('redis down'));

    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(200);
    expect((await res.json()).bosses[0].encounter).toBe('Chimaerus');
  });
});
