import type { BossResult } from '@/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROMPT_VERSION } from '@/lib/ai/prompt';
import { EXPOSURE_LIMIT } from '../rate-limit';
import { recordAdvice } from '../record-advice';

const { getServerSession, redisAppend, redisLlen, redisIncrBy, redisExpire } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  redisAppend: vi.fn(),
  redisLlen: vi.fn(),
  redisIncrBy: vi.fn(),
  redisExpire: vi.fn(),
}));

vi.mock('next-auth/next', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/redis', () => ({ redisAppend, redisLlen, redisIncrBy, redisExpire }));

function boss(): BossResult {
  return {
    renderId: 'r1',
    encounter: 'Vorasius',
    encounterId: 3177,
    difficulty: 5,
    specId: 103,
    fightTargets: [],
    character: {
      stats: {
        name: 'Jumbaa',
        avgIlvl: 284.1,
        primaryStat: 0,
        crit: 0,
        haste: 0,
        mastery: 0,
        vers: 0,
        talents: {},
      },
      rotation: {
        name: 'Jumbaa',
        dps: 105538,
        fightDurationMs: 326876,
        casts: { Shred: { guid: 5221, casts: 60, perMin: 11 } },
        buffs: {},
        opening: [],
      },
      damageTable: { entries: [{ guid: 5221, name: 'Shred', total: 5000000 }] },
      dps: 105538,
      dpsSource: 'ranking',
      bossDps: null,
      killTime: '5:26',
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
      referenceIlvl: 285,
      referenceIlvlCount: 3,
      myIlvl: 284.1,
      referenceKillTimeMs: 317924,
      myKillTimeMs: 326876,
      candidatesConsidered: 981,
      pagesFetched: 10,
      disqualified: 0,
      unverifiable: 0,
      substituted: 0,
    },
  };
}

const SESSION = { user: { email: 'raider@example.com' } };
const ARGS = { provider: 'groq', model: 'llama-3.3-70b-versatile' };

function written() {
  return JSON.parse(String(redisAppend.mock.calls[0][1]));
}

describe('recordAdvice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LABEL_SALT = 'pepper';
    getServerSession.mockResolvedValue(SESSION);
    redisAppend.mockResolvedValue(1);
    redisLlen.mockResolvedValue(0);
    redisIncrBy.mockResolvedValue(1);
    redisExpire.mockResolvedValue(undefined);
  });

  it('stamps the render, the prompt version and the provider, into the report month list', async () => {
    await recordAdvice(boss(), ARGS);

    expect(String(redisAppend.mock.calls[0][0])).toMatch(/^labels:report:\d{4}-\d{2}$/);
    expect(written()).toMatchObject({
      v: 3,
      kind: 'advice',
      renderId: 'r1',
      encounterId: 3177,
      difficulty: 5,
      specId: 103,
      promptVersion: PROMPT_VERSION,
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
    });
  });

  // Ce qu'un modèle peut apprendre du conseil, c'est sur quoi il a porté — jamais son texte.
  it('records the axes covered and no prose', async () => {
    await recordAdvice(boss(), ARGS);

    const record = written();
    expect(record.axes).toContain('spell-usage');
    expect(record.axes).not.toContain('uptimes');
    expect(record).not.toHaveProperty('prompt');
    expect(record).not.toHaveProperty('text');
  });

  it('identifies the account by its salted hash, never by its address', async () => {
    await recordAdvice(boss(), ARGS);

    expect(written().by).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(written())).not.toContain('raider@example.com');
  });

  // La voie BYOK arrive ici sans session : c'était la seule écriture du corpus que rien ne
  // bornait. On s'arrête avant `appendToCorpus`, donc avant même de mesurer le mois.
  it('writes nothing at all when the caller has no identity', async () => {
    getServerSession.mockResolvedValue(null);

    await recordAdvice(boss(), ARGS);

    expect(redisAppend).not.toHaveBeenCalled();
    expect(redisLlen).not.toHaveBeenCalled();
    expect(redisIncrBy).not.toHaveBeenCalled();
  });

  // Même raison que pour l'exposition : plutôt rien qu'un anonymat faux.
  it('writes nothing when the salt is missing and a session exists', async () => {
    delete process.env.LABEL_SALT;

    await recordAdvice(boss(), ARGS);

    expect(redisAppend).not.toHaveBeenCalled();
  });

  // Le quota est celui des expositions : un rapport IA est un rendu de plus.
  it('stops writing once the account has exhausted its exposure quota', async () => {
    redisIncrBy.mockResolvedValue(EXPOSURE_LIMIT + 1);

    await recordAdvice(boss(), ARGS);

    expect(redisAppend).not.toHaveBeenCalled();
    expect(String(redisIncrBy.mock.calls[0][0])).toMatch(/^ratelimit:exposure:[0-9a-f]{32}:\d+$/);
  });

  // La capture ne doit jamais empêcher le rapport de partir.
  it('never throws when the write or the session fails', async () => {
    redisAppend.mockRejectedValue(new Error('upstash down'));
    await expect(recordAdvice(boss(), ARGS)).resolves.toBeUndefined();

    getServerSession.mockRejectedValue(new Error('auth down'));
    await expect(recordAdvice(boss(), ARGS)).resolves.toBeUndefined();
  });
});
