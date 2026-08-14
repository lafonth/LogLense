import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BOSS_ANALYSIS_UNITS, guardWclSpend, quotaSubject } from '../wcl-guard';

const { getServerSession, consumeWclQuota, recordDemand } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  consumeWclQuota: vi.fn(),
  recordDemand: vi.fn(),
}));

vi.mock('next-auth/next', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/labels/rate-limit', () => ({ consumeWclQuota }));
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
    recordDemand.mockResolvedValue(undefined);
    getServerSession.mockResolvedValue({ user: { name: 'Player#1234' } });
  });

  it('refuses an anonymous caller before spending anything', async () => {
    getServerSession.mockResolvedValue(null);

    const refusal = await guardWclSpend('analyze', BOSS_ANALYSIS_UNITS);

    expect(refusal?.status).toBe(401);
    expect(consumeWclQuota).not.toHaveBeenCalled();
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
