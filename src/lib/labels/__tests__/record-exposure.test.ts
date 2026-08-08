import type { BossResult } from '@/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXPOSURE_LIMIT } from '../rate-limit';
import { recordExposure } from '../record-exposure';

const { getServerSession, redisAppend, redisIncrBy, redisExpire } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  redisAppend: vi.fn(),
  redisIncrBy: vi.fn(),
  redisExpire: vi.fn(),
}));

vi.mock('next-auth/next', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/redis', () => ({ redisAppend, redisIncrBy, redisExpire }));

function boss(renderId: string): BossResult {
  return {
    renderId,
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
        casts: {},
        buffs: {},
        opening: [],
      },
      damageTable: { entries: [] },
      dps: 105538,
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
      myIlvl: 284.1,
      referenceKillTimeMs: 317924,
      myKillTimeMs: 326876,
      candidatesConsidered: 981,
      pagesFetched: 10,
      disqualified: 0,
      substituted: 0,
    },
  };
}

const SESSION = { user: { email: 'raider@example.com' } };

/** Les enregistrements écrits, désérialisés. */
function written() {
  return redisAppend.mock.calls.map(([, value]) => JSON.parse(String(value)));
}

describe('recordExposure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LABEL_SALT = 'pepper';
    getServerSession.mockResolvedValue(SESSION);
    redisAppend.mockResolvedValue(1);
    redisIncrBy.mockResolvedValue(1);
    redisExpire.mockResolvedValue(undefined);
  });

  it('writes one record per analysed boss, into the month list', async () => {
    await recordExposure([boss('r1'), boss('r2')], { dpsSource: 'ranking' });

    expect(redisAppend).toHaveBeenCalledTimes(2);
    expect(written().map((r) => r.renderId)).toEqual(['r1', 'r2']);
    expect(String(redisAppend.mock.calls[0][0])).toMatch(/^labels:exposure:\d{4}-\d{2}$/);
    expect(written()[0]).toMatchObject({
      v: 4,
      kind: 'exposure',
      subject: { dpsSource: 'ranking' },
    });
  });

  // Un boss sans données n'a rien exposé : il n'y a pas de positif faible à en tirer.
  it('ignores the bosses that produced no result', async () => {
    await recordExposure([null, boss('r1'), null], { dpsSource: 'damage-table' });

    expect(redisAppend).toHaveBeenCalledTimes(1);
    expect(written()[0].renderId).toBe('r1');
  });

  it('identifies the account by its salted hash, never by its address', async () => {
    await recordExposure([boss('r1')], { dpsSource: 'ranking' });

    const record = written()[0];
    expect(record.by).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(record)).not.toContain('raider@example.com');
  });

  it('records an unauthenticated render as anonymous', async () => {
    getServerSession.mockResolvedValue(null);

    await recordExposure([boss('r1')], { dpsSource: 'ranking' });

    expect(written()[0].by).toBeNull();
  });

  // Se replier sur `by: null` affirmerait un anonymat faux et mélangerait dans le corpus des
  // identités salées et non salées — irréversible. On préfère ne rien écrire.
  it('writes nothing when the salt is missing and a session exists', async () => {
    delete process.env.LABEL_SALT;

    await recordExposure([boss('r1')], { dpsSource: 'ranking' });

    expect(redisAppend).not.toHaveBeenCalled();
  });

  it('stops writing once the account has exhausted its hourly quota', async () => {
    redisIncrBy.mockResolvedValue(EXPOSURE_LIMIT + 1);

    await recordExposure([boss('r1')], { dpsSource: 'ranking' });

    expect(redisAppend).not.toHaveBeenCalled();
  });

  // La capture ne doit jamais faire tomber l'analyse : c'est elle, le produit.
  it('never throws when the write fails', async () => {
    redisAppend.mockRejectedValue(new Error('upstash down'));

    await expect(recordExposure([boss('r1')], { dpsSource: 'ranking' })).resolves.toBeUndefined();
  });

  it('never throws when the session cannot be read', async () => {
    getServerSession.mockRejectedValue(new Error('auth down'));

    await expect(recordExposure([boss('r1')], { dpsSource: 'ranking' })).resolves.toBeUndefined();
    expect(redisAppend).not.toHaveBeenCalled();
  });
});
