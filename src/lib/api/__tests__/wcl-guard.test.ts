import { beforeEach, describe, expect, it, vi } from 'vitest';
import { countWclCall } from '@/lib/wcl/meter';
import {
  BOSS_ANALYSIS_UNITS,
  guardMeteredWclSpend,
  guardWclSpend,
  quotaSubject,
} from '../wcl-guard';

const {
  getServerSession,
  consumeWclQuota,
  consumeWclGlobalQuota,
  settleWclQuota,
  settleWclGlobalQuota,
  recordDemand,
} = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  consumeWclQuota: vi.fn(),
  consumeWclGlobalQuota: vi.fn(),
  settleWclQuota: vi.fn(),
  settleWclGlobalQuota: vi.fn(),
  recordDemand: vi.fn(),
}));

vi.mock('next-auth/next', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/labels/rate-limit', () => ({
  consumeWclQuota,
  consumeWclGlobalQuota,
  settleWclQuota,
  settleWclGlobalQuota,
}));
vi.mock('@/lib/labels/record-demand', () => ({ recordDemand }));

const ALLOWED = { allowed: true, retryAfterSeconds: 0, unavailable: false, consumed: 90 };

const DENIED = { allowed: false, retryAfterSeconds: 900, unavailable: false, consumed: 2090 };

const UNAVAILABLE = {
  allowed: false,
  retryAfterSeconds: 3600,
  unavailable: true,
  consumed: null,
};

describe('guardWclSpend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeWclQuota.mockResolvedValue(ALLOWED);
    consumeWclGlobalQuota.mockResolvedValue(ALLOWED);
    recordDemand.mockResolvedValue(undefined);
    getServerSession.mockResolvedValue({ user: { name: 'Player#1234' } });
  });

  it('refuses an anonymous caller before spending anything', async () => {
    getServerSession.mockResolvedValue(null);

    const refusal = await guardWclSpend('analyze', BOSS_ANALYSIS_UNITS);

    expect(refusal?.status).toBe(401);
    expect(consumeWclQuota).not.toHaveBeenCalled();
    expect(consumeWclGlobalQuota).not.toHaveBeenCalled();
  });

  // Rien à consigner : aucun verdict de quota n'existe encore, et la friction de l'allowlist
  // est une autre mesure, qui ne se range pas dans les mêmes seaux.
  it('records no demand for a caller who never reached the counter', async () => {
    getServerSession.mockResolvedValue(null);

    await guardWclSpend('analyze', BOSS_ANALYSIS_UNITS);

    expect(recordDemand).not.toHaveBeenCalled();
  });

  it('lets an authenticated caller through, charging what the request costs', async () => {
    await expect(guardWclSpend('analyze', BOSS_ANALYSIS_UNITS)).resolves.toBeNull();

    const [, , units] = consumeWclQuota.mock.calls[0] as [string, number, number];
    expect(units).toBe(BOSS_ANALYSIS_UNITS);
  });

  it('answers 429 with the delay to the next window once the quota is spent', async () => {
    consumeWclQuota.mockResolvedValue(DENIED);

    const refusal = await guardWclSpend('analyze', BOSS_ANALYSIS_UNITS);

    expect(refusal?.status).toBe(429);
    expect(refusal?.headers.get('Retry-After')).toBe('900');
  });

  // Compteur illisible : le quota échoue fermé, et 503 dit que c'est notre panne, pas un abus.
  it('answers 503 when the counter cannot be read', async () => {
    consumeWclQuota.mockResolvedValue(UNAVAILABLE);

    expect((await guardWclSpend('analyze', BOSS_ANALYSIS_UNITS))?.status).toBe(503);
  });

  // C'est le seul endroit où la demande adressée à WCL est observable en entier : les trois
  // issues du quota y passent, et le refus est justement celle qu'aucune relecture ne
  // reconstitue — la réponse part et disparaît.
  it.each([
    ['allowed', ALLOWED],
    ['denied', DENIED],
    ['unavailable', UNAVAILABLE],
  ])('records the demand on the %s path, with its route and its cost', async (_name, quota) => {
    consumeWclQuota.mockResolvedValue(quota);

    await guardWclSpend('report-analyze', 1800);

    expect(recordDemand).toHaveBeenCalledTimes(1);
    const [route, units, verdict] = recordDemand.mock.calls[0] as [string, number, unknown];
    expect(route).toBe('report-analyze');
    expect(units).toBe(1800);
    expect(verdict).toBe(quota);
  });

  // Attendue avant la réponse : sur un runtime serverless une promesse laissée en `void` part
  // avec la fonction, et le 429 est précisément l'enregistrement irrécupérable.
  it('waits for the write before answering, on the refused path too', async () => {
    consumeWclQuota.mockResolvedValue(DENIED);

    let written = false;
    recordDemand.mockImplementation(
      () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            written = true;
            resolve();
          }, 0)
        )
    );

    const refusal = await guardWclSpend('analyze', BOSS_ANALYSIS_UNITS);

    expect(refusal?.status).toBe(429);
    expect(written).toBe(true);
  });

  // Contrairement à `hashUserId`, l'absence de sel ne ferme pas la route : la clé vit une
  // heure, n'est jamais relue, et n'entre dans aucun corpus.
  it('derives a subject even without LABEL_SALT, and separates two accounts', () => {
    vi.stubEnv('LABEL_SALT', '');

    expect(quotaSubject('a@b.c')).toHaveLength(32);
    expect(quotaSubject('a@b.c')).not.toBe(quotaSubject('d@e.f'));
    expect(quotaSubject('a@b.c')).toBe(quotaSubject('a@b.c'));

    vi.unstubAllEnvs();
  });
});

// Le plafond par compte ne compose pas : dix bêta-testeurs valent dix fois `WCL_UNIT_LIMIT` par
// heure sans qu'aucun n'ait rien fait d'anormal, là où la sanction d'en face porte sur la clé et
// arrête le produit entier.
describe('guardWclSpend, against the shared ceiling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeWclQuota.mockResolvedValue(ALLOWED);
    consumeWclGlobalQuota.mockResolvedValue(ALLOWED);
    recordDemand.mockResolvedValue(undefined);
    getServerSession.mockResolvedValue({ user: { name: 'Player#1234' } });
  });

  it('charges the shared counter what it charges the account, on the same window', async () => {
    await guardWclSpend('analyze', BOSS_ANALYSIS_UNITS);

    const [, personalAt, personalUnits] = consumeWclQuota.mock.calls[0] as [string, number, number];
    expect(consumeWclGlobalQuota).toHaveBeenCalledWith(personalAt, personalUnits);
  });

  // L'ordre est l'invariant : consulté en premier, le compteur commun serait gonflé à chaque
  // tentative d'un appelant déjà refusé — et comme un refus n'est jamais réglé, un seul raider
  // qui martèle fermerait la porte aux neuf autres.
  it.each([
    ['denied', DENIED],
    ['unavailable', UNAVAILABLE],
  ])('never touches the shared counter for a %s account', async (_name, quota) => {
    consumeWclQuota.mockResolvedValue(quota);

    await guardWclSpend('analyze', BOSS_ANALYSIS_UNITS);

    expect(consumeWclGlobalQuota).not.toHaveBeenCalled();
  });

  it('refuses an account under its own quota once the shared ceiling is reached', async () => {
    consumeWclGlobalQuota.mockResolvedValue(DENIED);

    const refusal = await guardWclSpend('analyze', BOSS_ANALYSIS_UNITS);

    expect(refusal?.status).toBe(429);
    expect(refusal?.headers.get('Retry-After')).toBe('900');
  });

  // Fermé, comme le compteur par compte : ce plafond garde la clé du produit entier, et une
  // dépense collective non comptée est une dépense collective sans plafond.
  it('answers 503 when the shared counter cannot be read', async () => {
    consumeWclGlobalQuota.mockResolvedValue(UNAVAILABLE);

    expect((await guardWclSpend('analyze', BOSS_ANALYSIS_UNITS))?.status).toBe(503);
  });

  // Sans ça le corpus dirait « allowed » d'une requête refusée, et la seule mesure qui montre
  // le plafond commun mordre serait perdue.
  it('records the verdict of the counter that actually decided', async () => {
    consumeWclGlobalQuota.mockResolvedValue(DENIED);

    await guardWclSpend('analyze', BOSS_ANALYSIS_UNITS);

    const [, , verdict, , globalVerdict] = recordDemand.mock.calls[0] as [
      string,
      number,
      unknown,
      string,
      unknown,
    ];
    expect(verdict).toBe(ALLOWED);
    expect(globalVerdict).toBe(DENIED);
  });

  it('records no shared verdict when the account quota refused first', async () => {
    consumeWclQuota.mockResolvedValue(DENIED);

    await guardWclSpend('analyze', BOSS_ANALYSIS_UNITS);

    expect(recordDemand.mock.calls[0][4]).toBeNull();
  });
});

// Les deux compteurs ont réservé le même forfait, ils règlent le même écart : n'en régler qu'un
// laisserait le plafond commun mordre sur des appels qui ne sont jamais partis.
describe('guardMeteredWclSpend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeWclQuota.mockResolvedValue(ALLOWED);
    consumeWclGlobalQuota.mockResolvedValue(ALLOWED);
    recordDemand.mockResolvedValue(undefined);
    settleWclQuota.mockResolvedValue(undefined);
    settleWclGlobalQuota.mockResolvedValue(undefined);
    getServerSession.mockResolvedValue({ user: { name: 'Player#1234' } });
  });

  it('settles both counters with the same signed delta', async () => {
    await guardMeteredWclSpend('analyze', BOSS_ANALYSIS_UNITS, async () => {
      countWclCall();
      return new Response('ok');
    });

    const [, personalAt, ,] = consumeWclQuota.mock.calls[0] as [string, number, number];
    const delta = 1 - BOSS_ANALYSIS_UNITS;
    expect(settleWclQuota).toHaveBeenCalledWith(expect.any(String), personalAt, delta);
    expect(settleWclGlobalQuota).toHaveBeenCalledWith(personalAt, delta);
  });

  // Un refus n'est jamais réglé : rembourser une requête refusée rendrait le plafond
  // franchissable indéfiniment — et le commun aussi bien que le personnel.
  it('settles neither counter when the shared ceiling refused', async () => {
    consumeWclGlobalQuota.mockResolvedValue(DENIED);
    const run = vi.fn();

    expect((await guardMeteredWclSpend('analyze', BOSS_ANALYSIS_UNITS, run)).status).toBe(429);
    expect(run).not.toHaveBeenCalled();
    expect(settleWclQuota).not.toHaveBeenCalled();
    expect(settleWclGlobalQuota).not.toHaveBeenCalled();
  });
});
