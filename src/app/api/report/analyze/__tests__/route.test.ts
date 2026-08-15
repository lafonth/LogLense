import type { NextRequest } from 'next/server';
import type { BossResult } from '@/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordExposure } from '@/lib/labels/record-exposure';
import { getWCLToken } from '@/lib/wcl/auth';
import { analyzeReportBoss } from '@/lib/wcl/report-pipeline';
import { readSnapshot, reportSnapshotKey, writeSnapshot } from '@/lib/wcl/result-snapshot';
import { POST } from '../route';

// Le garde de quota WCL a ses propres tests ; ici on le neutralise par défaut — il exécute
// simplement l'analyse qu'on lui confie — et on vérifie seulement qu'un refus de sa part sort
// avant la moindre dépense. Il enveloppe désormais le corps du gestionnaire : c'est ainsi
// qu'il règle l'écart entre le forfait réservé et ce qui est réellement parti chez WCL.
const { guardMeteredWclSpend } = vi.hoisted(() => ({
  guardMeteredWclSpend: vi.fn(
    async (_route: string, _units: number, run: () => Promise<Response>) => run()
  ),
}));

vi.mock('@/lib/api/wcl-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/wcl-guard')>()),
  guardMeteredWclSpend,
}));

vi.mock('@/lib/wcl/auth', () => ({
  getWCLToken: vi.fn().mockResolvedValue('mock-token'),
}));

vi.mock('@/lib/wcl/report-pipeline', () => ({
  analyzeReportBoss: vi.fn(),
}));

vi.mock('@/lib/labels/record-exposure', () => ({
  recordExposure: vi.fn().mockResolvedValue(undefined),
}));

// La clé reste la vraie : c'est elle qui atteste que la route relit exactement ce qu'elle a
// écrit, et une clé simulée ferait passer une dérive entre les deux. Seules les deux
// entrées-sorties sont doublées — complétude et durée de vie ont leurs propres tests.
vi.mock('@/lib/wcl/result-snapshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/wcl/result-snapshot')>()),
  readSnapshot: vi.fn(),
  writeSnapshot: vi.fn(),
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
    dpsSource: 'ranking',
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
    context: null,
  },
  topPlayers: [],
  sample: [],
  comparability: {
    level: 'close',
    referenceIlvl: 636,
    referenceIlvlCount: 3,
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
    vi.mocked(getWCLToken).mockReset().mockResolvedValue('mock-token');
    guardMeteredWclSpend.mockClear();
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

  // Chaque rencontre vaut une cinquantaine de requêtes : une entrée malformée doit sortir
  // avant le garde de dépense, pas au milieu du `Promise.all` qui a déjà payé.
  it('returns 400 on a malformed encounter, without analysing anything', async () => {
    vi.mocked(analyzeReportBoss).mockClear();

    const res = await POST(
      makeRequest(validBody({ encounters: [{ id: 3306, name: 'Chimaerus', fightId: 17 }] }))
    );

    expect(res.status).toBe(400);
    expect(vi.mocked(analyzeReportBoss)).not.toHaveBeenCalled();
  });

  it('returns 400 on an empty encounter list', async () => {
    const res = await POST(makeRequest(validBody({ encounters: [] })));
    expect(res.status).toBe(400);
  });

  it('returns 400 rather than 500 on a body that is not JSON', async () => {
    const req = new Request('http://localhost/api/report/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not json',
    }) as unknown as NextRequest;

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // Le contrôle passe avant le garde : une clé absente ne rend aucune analyse, donc facturer
  // le quota de l'appelant pour un 500 certain lui prendrait des unités jamais dépensées.
  it('returns 500 on missing WCL credentials without touching the quota', async () => {
    delete process.env.WCL_CLIENT_ID;
    delete process.env.WCL_CLIENT_SECRET;

    const res = await POST(makeRequest(validBody()));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('WCL credentials not configured');
    expect(guardMeteredWclSpend).not.toHaveBeenCalled();
  });

  // Sans le `try/catch`, l'échec du jeton partait en exception non rattrapée : le client
  // lisait un 500 sans corps, là où l'autre route nomme la panne.
  it('returns 500 with the message when the token fetch throws', async () => {
    vi.mocked(getWCLToken).mockRejectedValue(new Error('WCL rate limit'));

    const res = await POST(makeRequest(validBody()));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('WCL rate limit');
  });

  // Une rencontre qui échoue est déjà rattrapée en `null` par le `Promise.all` : le lot part
  // en 200, le `try/catch` ne doit pas requalifier un boss manquant en panne de route.
  it('keeps a 200 when a single encounter fails', async () => {
    vi.mocked(analyzeReportBoss).mockRejectedValue(new Error('boss unavailable'));

    const res = await POST(makeRequest(validBody()));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.bosses).toEqual([null]);
  });

  // Le chemin rapport ne mesure pas le DPS comme le chemin personnage : il le calcule depuis
  // la table de dégâts. Le corpus doit porter laquelle des deux mesures il tient.
  it('records the exposure with the damage-table provenance', async () => {
    const res = await POST(makeRequest(validBody()));
    const body = await res.json();

    expect(recordExposure).toHaveBeenCalledTimes(1);
    expect(recordExposure).toHaveBeenCalledWith([mockBossResult]);
    // La réponse est inchangée par la capture.
    expect(body.bosses[0].renderId).toBe('render-1');
  });

  // Un boss dont l'analyse a échoué est `null` : `recordExposure` reçoit le lot tel quel et
  // décide seul de ce qu'il y a à écrire — la route ne trie pas à sa place.
  it('passes the failed bosses through as null', async () => {
    vi.mocked(analyzeReportBoss).mockResolvedValue(null);

    await POST(makeRequest(validBody()));

    expect(recordExposure).toHaveBeenCalledWith([null]);
  });

  it('still renders the analysis if the capture were to reject', async () => {
    vi.mocked(recordExposure).mockRejectedValue(new Error('redis down'));

    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(200);
    expect((await res.json()).bosses[0].encounter).toBe('Chimaerus');
  });
});

/**
 * Le chemin rapport analyse plusieurs rencontres d'un coup : l'instantané s'y joue rencontre
 * par rencontre, pas tout ou rien. Un rapport dont une seule pull a changé doit servir les
 * autres depuis le cache et ne recalculer que celle-là.
 */
describe('report analyze route, shared link', () => {
  const KEY_ARGS = { code: 'abc', actorId: 63, encounterId: 3306, fightId: 17, difficulty: 5 };
  const KEY = reportSnapshotKey(KEY_ARGS);

  const SECOND = { id: 3310, name: 'Nexus-King', fightId: 21, fightMs: 240000 };
  const SECOND_KEY = reportSnapshotKey({ ...KEY_ARGS, encounterId: 3310, fightId: 21 });

  beforeEach(() => {
    vi.mocked(analyzeReportBoss).mockReset().mockResolvedValue(mockBossResult);
    vi.mocked(recordExposure).mockReset().mockResolvedValue(undefined);
    vi.mocked(getWCLToken).mockReset().mockResolvedValue('mock-token');
    vi.mocked(readSnapshot).mockReset().mockResolvedValue(null);
    vi.mocked(writeSnapshot).mockReset().mockResolvedValue(undefined);
    guardMeteredWclSpend.mockClear();
    process.env.WCL_CLIENT_ID = 'test-id';
    process.env.WCL_CLIENT_SECRET = 'test-secret';
  });

  it('reads no snapshot without the marker, and stores what it computed', async () => {
    await POST(makeRequest(validBody()));

    expect(readSnapshot).not.toHaveBeenCalled();
    expect(writeSnapshot).toHaveBeenCalledWith(KEY, mockBossResult);
  });

  it('serves the snapshot without touching Warcraft Logs when the marker is set', async () => {
    const shared = { ...mockBossResult, renderId: 'render-shared' };
    vi.mocked(readSnapshot).mockResolvedValue(shared);

    const res = await POST(makeRequest(validBody({ preferSnapshot: true })));
    const body = await res.json();

    expect(readSnapshot).toHaveBeenCalledWith(KEY);
    expect(body.bosses[0].renderId).toBe('render-shared');
    // Le jeton n'est demandé que s'il reste une rencontre à calculer : un lien entièrement
    // servi ne doit toucher ni l'API ni l'OAuth de Warcraft Logs.
    expect(getWCLToken).not.toHaveBeenCalled();
    expect(analyzeReportBoss).not.toHaveBeenCalled();
    expect(writeSnapshot).not.toHaveBeenCalled();
    expect(recordExposure).toHaveBeenCalledWith([shared]);
  });

  // Le cas réel du partage en guilde : le lien porte tout le rapport, une seule rencontre a
  // expiré. Un tout-ou-rien rejouerait les autres pour rien.
  it('recomputes only the encounter whose snapshot is missing', async () => {
    const shared = { ...mockBossResult, renderId: 'render-shared' };
    vi.mocked(readSnapshot).mockImplementation(async (key) => (key === KEY ? shared : null));

    const res = await POST(
      makeRequest(
        validBody({
          preferSnapshot: true,
          encounters: [{ id: 3306, name: 'Chimaerus', fightId: 17, fightMs: 180000 }, SECOND],
        })
      )
    );
    const body = await res.json();

    expect(body.bosses[0].renderId).toBe('render-shared');
    expect(body.bosses[1].renderId).toBe('render-1');
    // Le troisième argument est l'`encounterId` : seule la rencontre manquante est analysée.
    expect(analyzeReportBoss).toHaveBeenCalledTimes(1);
    expect(vi.mocked(analyzeReportBoss).mock.calls[0][2]).toBe(3310);
    // Il reste une rencontre froide : le jeton est bien demandé, une seule fois.
    expect(getWCLToken).toHaveBeenCalledTimes(1);
    // Et seule celle-là est écrite — l'autre garderait sinon une expiration repoussée.
    expect(writeSnapshot).toHaveBeenCalledTimes(1);
    expect(writeSnapshot).toHaveBeenCalledWith(SECOND_KEY, mockBossResult);
  });

  // Une rencontre qui a échoué revient en `null` : la figer servirait le trou pendant vingt-
  // quatre heures à tous ceux qui ouvrent le lien.
  it('stores nothing for an encounter that failed', async () => {
    vi.mocked(analyzeReportBoss).mockRejectedValue(new Error('boss unavailable'));

    const res = await POST(makeRequest(validBody({ preferSnapshot: true })));

    expect(res.status).toBe(200);
    expect(writeSnapshot).not.toHaveBeenCalled();
  });

  it('refuses a marker that is not a boolean, before reading anything', async () => {
    const res = await POST(makeRequest(validBody({ preferSnapshot: 'yes' })));

    expect(res.status).toBe(400);
    expect(readSnapshot).not.toHaveBeenCalled();
  });
});

// Sans ce test, retirer le garde d'une route ne casserait rien : c'est lui qui atteste que
// le refus sort avant le premier appel à Warcraft Logs.
describe('report analyze route under the WCL guard', () => {
  it('returns the guard refusal without spending anything', async () => {
    guardMeteredWclSpend.mockResolvedValueOnce(new Response(null, { status: 429 }));
    vi.mocked(analyzeReportBoss).mockClear();

    const res = await POST(makeRequest(validBody()));

    expect(res.status).toBe(429);
    expect(vi.mocked(analyzeReportBoss)).not.toHaveBeenCalled();
  });
});
