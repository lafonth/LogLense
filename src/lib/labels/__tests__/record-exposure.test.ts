import type { BossResult } from '@/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CORPUS_MONTH_CAP } from '../corpus';
import { EXPOSURE_LIMIT } from '../rate-limit';
import { recordExposure } from '../record-exposure';

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
      poolDps: null,
      poolIlvl: null,
      poolIlvlCount: 0,
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
    redisLlen.mockResolvedValue(0);
    redisIncrBy.mockResolvedValue(1);
    redisExpire.mockResolvedValue(undefined);
  });

  it('writes one record per analysed boss, into the month list', async () => {
    await recordExposure([boss('r1'), boss('r2')]);

    expect(redisAppend).toHaveBeenCalledTimes(2);
    expect(written().map((r) => r.renderId)).toEqual(['r1', 'r2']);
    expect(String(redisAppend.mock.calls[0][0])).toMatch(/^labels:exposure:\d{4}-\d{2}$/);
    expect(written()[0]).toMatchObject({
      v: 4,
      kind: 'exposure',
      subject: { dpsSource: 'ranking' },
    });
  });

  // La provenance était affirmée par la route, pour tout le lot. Elle vient maintenant de
  // chaque résultat : deux boss d'une même requête peuvent ne pas l'avoir mesurée pareil,
  // et un corpus qui l'uniformiserait deviendrait inanalysable.
  it('reads the dps provenance from each result rather than from the caller', async () => {
    const derived = boss('r2');
    derived.character.dpsSource = 'damage-table';

    await recordExposure([boss('r1'), derived]);

    expect(written().map((r) => r.subject.dpsSource)).toEqual(['ranking', 'damage-table']);
  });

  // Un mois plein arrête le lot avant la première écriture : le plafond existe pour qu'une
  // instance saturée ne fasse pas perdre les verdicts humains, qui sont d'un autre flux.
  it('writes nothing once the month has reached its cap', async () => {
    redisLlen.mockResolvedValue(CORPUS_MONTH_CAP);

    await recordExposure([boss('r1'), boss('r2')]);

    expect(redisAppend).not.toHaveBeenCalled();
  });

  // Un boss sans données n'a rien exposé : il n'y a pas de positif faible à en tirer.
  it('ignores the bosses that produced no result', async () => {
    await recordExposure([null, boss('r1'), null]);

    expect(redisAppend).toHaveBeenCalledTimes(1);
    expect(written()[0].renderId).toBe('r1');
  });

  it('identifies the account by its salted hash, never by its address', async () => {
    await recordExposure([boss('r1')]);

    const record = written()[0];
    expect(record.by).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(record)).not.toContain('raider@example.com');
  });

  // Un rendu anonyme ne débitait aucun quota : c'était la seule écriture du corpus que rien
  // ne bornait, dans une clé que rien ne purge.
  it('writes nothing when the caller has no identity', async () => {
    getServerSession.mockResolvedValue(null);

    await recordExposure([boss('r1')]);

    expect(redisAppend).not.toHaveBeenCalled();
    expect(redisLlen).not.toHaveBeenCalled();
  });

  // Se replier sur `by: null` affirmerait un anonymat faux et mélangerait dans le corpus des
  // identités salées et non salées — irréversible. On préfère ne rien écrire.
  it('writes nothing when the salt is missing and a session exists', async () => {
    delete process.env.LABEL_SALT;

    await recordExposure([boss('r1')]);

    expect(redisAppend).not.toHaveBeenCalled();
  });

  it('stops writing once the account has exhausted its hourly quota', async () => {
    redisIncrBy.mockResolvedValue(EXPOSURE_LIMIT + 1);

    await recordExposure([boss('r1')]);

    expect(redisAppend).not.toHaveBeenCalled();
  });

  // Vingt boss valaient vingt allers-retours Upstash en file, tous avant que la réponse
  // parte. C'est l'attente qui est non négociable, pas l'ordre.
  it('issues the writes together rather than one after the other', async () => {
    let inFlight = 0;
    let peak = 0;
    const release: (() => void)[] = [];
    redisAppend.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise<void>((resolve) => release.push(resolve));
      inFlight -= 1;
      return 1;
    });

    const done = recordExposure([boss('r1'), boss('r2'), boss('r3')]);
    await vi.waitFor(() => expect(release).toHaveLength(3));
    release.forEach((resolve) => resolve());
    await done;

    expect(peak).toBe(3);
  });

  // Un rejet rendrait la main sous `Promise.all`, et la fonction serverless emporterait les
  // écritures encore en vol : le refus d'une capture ne doit pas coûter les autres.
  it('waits for the other writes when one is refused', async () => {
    let landed = 0;
    redisAppend.mockRejectedValueOnce(new Error('upstash down')).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      landed += 1;
      return 1;
    });

    await recordExposure([boss('r1'), boss('r2'), boss('r3')]);

    expect(landed).toBe(2);
  });

  // La capture ne doit jamais faire tomber l'analyse : c'est elle, le produit.
  it('never throws when the write fails', async () => {
    redisAppend.mockRejectedValue(new Error('upstash down'));

    await expect(recordExposure([boss('r1')])).resolves.toBeUndefined();
  });

  it('never throws when the session cannot be read', async () => {
    getServerSession.mockRejectedValue(new Error('auth down'));

    await expect(recordExposure([boss('r1')])).resolves.toBeUndefined();
    expect(redisAppend).not.toHaveBeenCalled();
  });
});
