import type { BossResult } from '@/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recordExposure } from '@/lib/labels/record-exposure';
import { getWCLToken } from '@/lib/wcl/auth';
import { analyzeBoss } from '@/lib/wcl/pipeline';
import { characterSnapshotKey, readSnapshot, writeSnapshot } from '@/lib/wcl/result-snapshot';
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

vi.mock('@/lib/wcl/pipeline', () => ({
  analyzeBoss: vi.fn(),
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
    expect(recordExposure).toHaveBeenCalledWith([mockBossResult]);
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

    expect(recordExposure).toHaveBeenCalledWith([]);
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

/**
 * Ce que vérifient ces tests est le câblage, pas l'instantané : quand la route lit, quand elle
 * écrit, et ce que la lecture épargne. La lecture vit à l'intérieur du garde et non dans une
 * route à part — c'est la réservation qui refuse l'appelant anonyme, ce que le §2a demande.
 */
describe('analyze route, shared link', () => {
  const KEY_ARGS = {
    region: 'EU',
    serverSlug: 'ysondre',
    characterName: 'Jumbaa',
    encounterId: 3306,
    difficulty: 5,
    specId: 103,
  };

  const KEY = characterSnapshotKey(KEY_ARGS);

  const BODY = {
    characterName: 'Jumbaa',
    serverSlug: 'ysondre',
    region: 'EU',
    difficulty: 5,
    encounterName: 'Chimaerus',
    specId: 103,
  };

  function post(body: Record<string, unknown>) {
    return POST(makeRequest(body), { params: Promise.resolve({ encounterId: '3306' }) });
  }

  beforeEach(() => {
    vi.mocked(analyzeBoss).mockReset().mockResolvedValue(mockBossResult);
    vi.mocked(recordExposure).mockReset().mockResolvedValue(undefined);
    vi.mocked(getWCLToken).mockReset().mockResolvedValue('mock-token');
    vi.mocked(readSnapshot).mockReset().mockResolvedValue(null);
    vi.mocked(writeSnapshot).mockReset().mockResolvedValue(undefined);
    process.env.WCL_CLIENT_ID = 'test-id';
    process.env.WCL_CLIENT_SECRET = 'test-secret';
  });

  // Sans la marque, l'analyse est neuve : un raideur qui relance entre deux pulls doit voir
  // la sienne, pas celle d'il y a deux heures.
  it('reads no snapshot without the marker, and stores what it computed', async () => {
    await post(BODY);

    expect(readSnapshot).not.toHaveBeenCalled();
    expect(writeSnapshot).toHaveBeenCalledWith(KEY, mockBossResult);
  });

  it('serves the snapshot without touching Warcraft Logs when the marker is set', async () => {
    const shared = { ...mockBossResult, renderId: 'render-shared' };
    vi.mocked(readSnapshot).mockResolvedValue(shared);

    const res = await post({ ...BODY, preferSnapshot: true });
    const body = await res.json();

    expect(readSnapshot).toHaveBeenCalledWith(KEY);
    expect(body.renderId).toBe('render-shared');
    // Ni l'API ni l'OAuth : un lien servi par l'instantané ne doit rien coûter chez WCL.
    expect(getWCLToken).not.toHaveBeenCalled();
    expect(analyzeBoss).not.toHaveBeenCalled();
    // Réécrire ce qu'on vient de lire repousserait l'expiration à chaque ouverture du lien.
    expect(writeSnapshot).not.toHaveBeenCalled();
    // Un rendu a bien eu lieu : la capture part comme sur le chemin froid, sans quoi le corpus
    // perdrait toutes les ouvertures d'un lien partagé.
    expect(recordExposure).toHaveBeenCalledWith([shared]);
  });

  // Échouer ouvert veut dire rendre l'analyse, pas rendre une erreur : l'instantané perdu doit
  // coûter des requêtes, jamais un écran.
  it('falls back to a fresh analysis when the snapshot is gone', async () => {
    const res = await post({ ...BODY, preferSnapshot: true });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.renderId).toBe('render-1');
    expect(analyzeBoss).toHaveBeenCalledTimes(1);
    expect(writeSnapshot).toHaveBeenCalledWith(KEY, mockBossResult);
  });

  // La variante n'est jamais lue mais elle est écrite : sous la clé de base, un basculement de
  // spec écraserait l'analyse de départ et le lien rendrait l'autre spec.
  it('stores a spec override under its own key', async () => {
    await post({ ...BODY, specIdOverride: 62 });

    expect(writeSnapshot).toHaveBeenCalledWith(
      characterSnapshotKey({ ...KEY_ARGS, specIdOverride: 62 }),
      mockBossResult
    );
  });

  // Un personnage sans données rend `null` en 200 : le figer occuperait la clé pendant vingt-
  // quatre heures et transformerait un trou de collecte en verdict.
  it('stores nothing when the analysis came back empty', async () => {
    vi.mocked(analyzeBoss).mockResolvedValue(null);

    await post(BODY);

    expect(writeSnapshot).not.toHaveBeenCalled();
  });

  it('refuses a marker that is not a boolean, before reading anything', async () => {
    const res = await post({ ...BODY, preferSnapshot: 'yes' });

    expect(res.status).toBe(400);
    expect(readSnapshot).not.toHaveBeenCalled();
  });
});

// Sans ce test, retirer le garde d'une route ne casserait rien : c'est lui qui atteste que
// le refus sort avant le premier appel à Warcraft Logs.
describe('analyze route under the WCL guard', () => {
  it('returns the guard refusal without spending anything', async () => {
    guardMeteredWclSpend.mockResolvedValueOnce(new Response(null, { status: 429 }));
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
