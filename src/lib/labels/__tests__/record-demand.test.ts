import type { StrictVerdict } from '../rate-limit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CORPUS_MONTH_CAP, DEMAND_MONTH_CAP } from '../corpus';
import { WCL_UNIT_LIMIT } from '../rate-limit';
import { demandMonthKey, recordDemand } from '../record-demand';

const { redisAppend, redisLlen } = vi.hoisted(() => ({
  redisAppend: vi.fn(),
  redisLlen: vi.fn(),
}));

// Jeu de doublures plus petit que celui de `recordPool` : ce module ne lit pas la session — le
// garde l'a déjà résolue — et ne consomme aucun quota d'exposition.
vi.mock('@/lib/redis', () => ({ redisAppend, redisLlen }));

const USER = 'raider@example.com';

function verdict(over: Partial<StrictVerdict> = {}): StrictVerdict {
  return { allowed: true, retryAfterSeconds: 0, unavailable: false, consumed: 90, ...over };
}

/** Les enregistrements écrits, désérialisés. */
function written() {
  return redisAppend.mock.calls.map(([, value]) => JSON.parse(String(value)));
}

describe('demandMonthKey', () => {
  it('files an instant under the month of its own timestamp', () => {
    expect(demandMonthKey('2026-08-14T21:03:00.000Z')).toBe('labels:demand:2026-08');
  });

  it('gives two neighbouring months lists of their own', () => {
    expect(demandMonthKey('2026-08-31T23:59:59.999Z')).not.toBe(
      demandMonthKey('2026-09-01T00:00:00.000Z')
    );
  });
});

describe('recordDemand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LABEL_SALT = 'pepper';
    redisAppend.mockResolvedValue(1);
    redisLlen.mockResolvedValue(0);
  });

  it('writes one record per request, into the month list', async () => {
    await recordDemand('analyze', 90, verdict({ consumed: 180 }), USER);

    expect(redisAppend).toHaveBeenCalledTimes(1);
    expect(String(redisAppend.mock.calls[0][0])).toMatch(/^labels:demand:\d{4}-\d{2}$/);
    expect(written()[0]).toMatchObject({
      route: 'analyze',
      units: 90,
      consumed: 180,
      limit: WCL_UNIT_LIMIT,
      outcome: 'allowed',
    });
  });

  // C'est tout l'objet du flux : le refus est un seau parmi d'autres, et c'est celui qu'aucune
  // relecture ne reconstitue — la réponse 429 part et disparaît.
  it('records a refusal as such, not as an absence', async () => {
    await recordDemand(
      'report-analyze',
      1800,
      verdict({ allowed: false, retryAfterSeconds: 900, consumed: WCL_UNIT_LIMIT + 1800 }),
      USER
    );

    expect(written()[0]).toMatchObject({
      route: 'report-analyze',
      units: 1800,
      outcome: 'denied',
      consumed: WCL_UNIT_LIMIT + 1800,
    });
  });

  // Un compteur illisible n'est pas un plafond atteint : les ranger dans le même seau ferait
  // lire une panne Redis comme une demande excédentaire.
  it('separates a counter it could not read from a ceiling it reached', async () => {
    await recordDemand(
      'analyze',
      90,
      verdict({ allowed: false, unavailable: true, consumed: null }),
      USER
    );

    expect(written()[0]).toMatchObject({ outcome: 'unavailable', consumed: null });
  });

  // Un discriminant absent ne se rattrape pas : le corpus est append-only et jamais purgé, donc
  // une ligne écrite sans `v` ni `kind` reste illisible pour toujours. Ce test existe pour que
  // les retirer casse ici plutôt que dans six mois, à la relecture.
  it('carries the version and the kind that make it readable later', async () => {
    await recordDemand('analyze', 90, verdict(), USER);

    expect(written()[0]).toMatchObject({ v: 1, kind: 'demand' });
  });

  it('identifies the account by its salted hash, never by its address', async () => {
    await recordDemand('zones', 1, verdict(), USER);

    const record = written()[0];
    expect(record.by).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(record)).not.toContain(USER);
  });

  // Échec fermé sur l'identité, comme les six autres flux : `hashUserId` jette sans sel, et on
  // préfère ne rien écrire à un identifiant non salé.
  it('writes nothing when the salt is missing', async () => {
    delete process.env.LABEL_SALT;

    await expect(recordDemand('analyze', 90, verdict(), USER)).resolves.toBeUndefined();
    expect(redisAppend).not.toHaveBeenCalled();
  });

  // Ce flux écrit une ligne par requête qui dépense, lectures de métadonnées à une unité
  // comprises : au plafond commun il fermerait le mois avant les verdicts humains.
  it('has its own cap, larger than the common one', async () => {
    expect(DEMAND_MONTH_CAP).toBeGreaterThan(CORPUS_MONTH_CAP);

    redisLlen.mockResolvedValue(CORPUS_MONTH_CAP);
    await recordDemand('analyze', 90, verdict(), USER);
    expect(redisAppend).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    redisLlen.mockResolvedValue(DEMAND_MONTH_CAP);
    await recordDemand('analyze', 90, verdict(), USER);
    expect(redisAppend).not.toHaveBeenCalled();
  });

  it('writes nothing once the month is full, and does not throw', async () => {
    redisLlen.mockResolvedValue(DEMAND_MONTH_CAP);

    await expect(recordDemand('analyze', 90, verdict(), USER)).resolves.toBeUndefined();
    expect(redisAppend).not.toHaveBeenCalled();
  });

  // La capture est attendue avant la réponse : si elle jetait, elle ferait tomber la requête
  // qu'elle observe — y compris le 429, dont le corps est déjà écrit.
  it('never throws when the write fails', async () => {
    redisAppend.mockRejectedValue(new Error('upstash down'));

    await expect(recordDemand('analyze', 90, verdict(), USER)).resolves.toBeUndefined();
  });

  // `hasCorpusRoom` échoue fermé : ce qu'on n'a pas su compter, on ne l'écrit pas dans une
  // clé que rien ne purge. Une ligne de demande perdue se rattrape à la requête suivante.
  it('writes nothing when the length of the month cannot be read', async () => {
    redisLlen.mockRejectedValue(new Error('upstash down'));

    await recordDemand('analyze', 90, verdict(), USER);

    expect(redisAppend).not.toHaveBeenCalled();
  });
});
