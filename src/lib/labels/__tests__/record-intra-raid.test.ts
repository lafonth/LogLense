import type { RaidRanking, RankedRaider } from '@/lib/wcl/raid-ranking';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CORPUS_MONTH_CAP } from '../corpus';
import { EXPOSURE_LIMIT } from '../rate-limit';
import { recordIntraRaid } from '../record-intra-raid';

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

const SESSION = { user: { email: 'raider@example.com' } };

function raider(over: Partial<RankedRaider> = {}): RankedRaider {
  return {
    actorId: 1,
    name: 'Jumbaa',
    className: 'Druid',
    specName: 'Feral',
    specId: 103,
    dps: 100_000,
    percentile: 50,
    tierPieces: 4,
    ...over,
  };
}

function ranking(players: RankedRaider[]): RaidRanking {
  return {
    code: 'abc',
    fightID: 7,
    encounterID: 3177,
    encounterName: 'Vorasius',
    difficulty: 5,
    kill: true,
    fightMs: 300_000,
    criterion: 'percentile',
    criterionReason: '',
    players,
  };
}

/** Deux joueurs de même spec : une paire, le plus bas est le sujet. */
function onePair(): RaidRanking {
  return ranking([
    raider({ actorId: 1, percentile: 20, dps: 90_000 }),
    raider({ actorId: 2, percentile: 80, dps: 100_000 }),
  ]);
}

/** Trois joueurs de même spec : trois paires. */
function threePairs(): RaidRanking {
  return ranking([raider({ actorId: 1 }), raider({ actorId: 2 }), raider({ actorId: 3 })]);
}

/** Les enregistrements écrits, désérialisés. */
function written() {
  return redisAppend.mock.calls.map(([, value]) => JSON.parse(String(value)));
}

describe('recordIntraRaid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LABEL_SALT = 'pepper';
    getServerSession.mockResolvedValue(SESSION);
    redisAppend.mockResolvedValue(1);
    redisLlen.mockResolvedValue(0);
    redisIncrBy.mockResolvedValue(1);
    redisExpire.mockResolvedValue(undefined);
  });

  it('writes one record per pair, into the intra-raid month list', async () => {
    await recordIntraRaid(onePair());

    expect(redisAppend).toHaveBeenCalledTimes(1);
    expect(String(redisAppend.mock.calls[0][0])).toMatch(/^labels:intra-raid:\d{4}-\d{2}$/);
    expect(written()[0]).toMatchObject({
      v: 1,
      kind: 'intra-raid',
      specId: 103,
      fight: { code: 'abc', fightID: 7 },
      confidence: 'high',
    });
  });

  // Toutes les paires viennent de la même pull : un instant par lot, pas par paire.
  it('stamps the whole batch with a single instant', async () => {
    await recordIntraRaid(threePairs());

    expect(redisAppend).toHaveBeenCalledTimes(3);
    const stamps = new Set(written().map((r) => r.at));
    expect(stamps.size).toBe(1);
  });

  // Le classement lui-même n'a pas de valeur d'étiquette : c'est la paire qui en a une.
  it('writes nothing when no spec was played twice', async () => {
    await recordIntraRaid(ranking([raider({ actorId: 1, specId: 103 })]));

    expect(redisAppend).not.toHaveBeenCalled();
  });

  it('writes nothing once the month has reached the corpus cap', async () => {
    redisLlen.mockResolvedValue(CORPUS_MONTH_CAP);

    await recordIntraRaid(onePair());

    expect(redisAppend).not.toHaveBeenCalled();
  });

  // Une mesure de place pour le lot, pas une par paire : voir `hasCorpusRoom`.
  it('measures the room once for the whole batch', async () => {
    await recordIntraRaid(threePairs());

    expect(redisLlen).toHaveBeenCalledTimes(1);
  });

  it('identifies the account by its salted hash, never by its address', async () => {
    await recordIntraRaid(onePair());

    expect(written()[0].by).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(written()[0])).not.toContain('raider@example.com');
  });

  // Se replier sur `by: null` affirmerait un anonymat faux : on préfère ne rien écrire.
  it('writes nothing when the salt is missing and a session exists', async () => {
    delete process.env.LABEL_SALT;

    await recordIntraRaid(onePair());

    expect(redisAppend).not.toHaveBeenCalled();
  });

  it('spends one exposure token per pair', async () => {
    await recordIntraRaid(threePairs());

    expect(redisIncrBy).toHaveBeenCalledTimes(3);
    expect(String(redisIncrBy.mock.calls[0][0])).toMatch(/^ratelimit:exposure:[0-9a-f]{32}:\d+$/);
  });

  it('stops writing once the account has exhausted its hourly quota', async () => {
    redisIncrBy.mockResolvedValue(EXPOSURE_LIMIT + 1);

    await recordIntraRaid(threePairs());

    expect(redisAppend).not.toHaveBeenCalled();
  });

  // Une pull de vingt joueurs produit bien plus de paires qu'une analyse ne produit de boss :
  // les mettre en file, c'est autant d'allers-retours Upstash avant que la réponse parte.
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

    const done = recordIntraRaid(threePairs());
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

    await recordIntraRaid(threePairs());

    expect(landed).toBe(2);
  });

  // Le quota s'épuise au milieu du lot : les paires déjà autorisées ont payé leur jeton, elles
  // s'écrivent. Les abandonner ferait payer un jeton pour rien.
  it('writes the pairs that paid their token before the quota ran out', async () => {
    redisIncrBy
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValue(EXPOSURE_LIMIT + 1);

    await recordIntraRaid(threePairs());

    expect(redisAppend).toHaveBeenCalledTimes(2);
  });

  // La capture ne doit jamais faire tomber la réponse du mode raid : c'est elle, le produit.
  it('never throws when the write fails', async () => {
    redisAppend.mockRejectedValue(new Error('upstash down'));

    await expect(recordIntraRaid(onePair())).resolves.toBeUndefined();
  });

  it('never throws when the session cannot be read', async () => {
    getServerSession.mockRejectedValue(new Error('auth down'));

    await expect(recordIntraRaid(onePair())).resolves.toBeUndefined();
    expect(redisAppend).not.toHaveBeenCalled();
  });
});
