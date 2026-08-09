import type { PoolObservation } from '../pool';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CORPUS_MONTH_CAP, POOL_MONTH_CAP } from '../corpus';
import { EXPOSURE_LIMIT } from '../rate-limit';
import { recordPool } from '../record-pool';

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

const CONTEXT = {
  encounterId: 3177,
  difficulty: 5,
  specId: 103,
  subject: { code: 'aaa', fightID: 3, ilvl: 280, killTimeMs: 300_000 },
};

const SESSION = { user: { email: 'raider@example.com' } };

function observation(over: Partial<PoolObservation> = {}): PoolObservation {
  return {
    code: 'bbb',
    fightID: 7,
    actorId: 12,
    ilvl: 280,
    killTimeMs: 300_000,
    dps: 100_000,
    distance: 1,
    verified: true,
    tierPieces: 4,
    externalUptime: 0,
    disqualifiedBy: [],
    explored: false,
    shown: false,
    substitute: false,
    ...over,
  };
}

/** Les enregistrements écrits, désérialisés. */
function written() {
  return redisAppend.mock.calls.map(([, value]) => JSON.parse(String(value)));
}

describe('recordPool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LABEL_SALT = 'pepper';
    getServerSession.mockResolvedValue(SESSION);
    redisAppend.mockResolvedValue(1);
    redisLlen.mockResolvedValue(0);
    redisIncrBy.mockResolvedValue(1);
    redisExpire.mockResolvedValue(undefined);
  });

  it('writes one record per candidate, into the month list', async () => {
    await recordPool(
      [observation({ code: 'x', shown: true }), observation({ code: 'y' })],
      CONTEXT
    );

    expect(redisAppend).toHaveBeenCalledTimes(2);
    expect(String(redisAppend.mock.calls[0][0])).toMatch(/^labels:pool:\d{4}-\d{2}$/);
    expect(written().map((r) => r.candidate.code)).toEqual(['x', 'y']);
    expect(written()[0]).toMatchObject({ v: 1, kind: 'pool', subject: CONTEXT.subject });
  });

  // Tous les candidats viennent de la même analyse : une semaine par lot, pas par ligne.
  it('stamps the whole batch with a single instant and week', async () => {
    await recordPool([observation({ code: 'x' }), observation({ code: 'y' })], CONTEXT);

    const [first, second] = written();
    expect(second.at).toBe(first.at);
    expect(second.week).toBe(first.week);
  });

  it('writes nothing when the analysis had no candidates', async () => {
    await recordPool([], CONTEXT);

    expect(redisAppend).not.toHaveBeenCalled();
    expect(getServerSession).not.toHaveBeenCalled();
  });

  // Ce flux a son propre plafond : une soirée de vivier ne doit pas fermer le mois aux
  // verdicts humains, qui sont d'un autre flux et bien plus rares.
  it('has its own cap, larger than the common one', async () => {
    expect(POOL_MONTH_CAP).toBeGreaterThan(CORPUS_MONTH_CAP);

    redisLlen.mockResolvedValue(CORPUS_MONTH_CAP);
    await recordPool([observation()], CONTEXT);
    expect(redisAppend).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    redisLlen.mockResolvedValue(POOL_MONTH_CAP);
    getServerSession.mockResolvedValue(SESSION);
    redisIncrBy.mockResolvedValue(1);
    await recordPool([observation()], CONTEXT);
    expect(redisAppend).not.toHaveBeenCalled();
  });

  // Le quota borne des analyses, pas des candidats : un lot coupé en son milieu écrirait un
  // vivier amputé de ses écartés, exactement l'observation biaisée qu'on veut éviter.
  it('spends a single quota token for the whole batch', async () => {
    await recordPool([observation(), observation(), observation()], CONTEXT);

    expect(redisIncrBy).toHaveBeenCalledTimes(1);
    expect(redisAppend).toHaveBeenCalledTimes(3);
  });

  it('writes nothing once the account has exhausted its hourly quota', async () => {
    redisIncrBy.mockResolvedValue(EXPOSURE_LIMIT + 1);

    await recordPool([observation()], CONTEXT);

    expect(redisAppend).not.toHaveBeenCalled();
  });

  it('identifies the account by its salted hash, never by its address', async () => {
    await recordPool([observation()], CONTEXT);

    const record = written()[0];
    expect(record.by).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(record)).not.toContain('raider@example.com');
  });

  it('records an unauthenticated analysis as anonymous', async () => {
    getServerSession.mockResolvedValue(null);

    await recordPool([observation()], CONTEXT);

    expect(written()[0].by).toBeNull();
  });

  // Se replier sur `by: null` affirmerait un anonymat faux : on préfère ne rien écrire.
  it('writes nothing when the salt is missing and a session exists', async () => {
    delete process.env.LABEL_SALT;

    await recordPool([observation()], CONTEXT);

    expect(redisAppend).not.toHaveBeenCalled();
  });

  // La capture ne doit jamais faire tomber l'analyse : c'est elle, le produit.
  it('never throws when the write fails', async () => {
    redisAppend.mockRejectedValue(new Error('upstash down'));

    await expect(recordPool([observation()], CONTEXT)).resolves.toBeUndefined();
  });

  it('never throws when the session cannot be read', async () => {
    getServerSession.mockRejectedValue(new Error('auth down'));

    await expect(recordPool([observation()], CONTEXT)).resolves.toBeUndefined();
    expect(redisAppend).not.toHaveBeenCalled();
  });
});
