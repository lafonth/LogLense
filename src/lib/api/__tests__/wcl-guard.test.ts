import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BOSS_ANALYSIS_UNITS, guardWclSpend, quotaSubject } from '../wcl-guard';

const { getServerSession, consumeWclQuota } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  consumeWclQuota: vi.fn(),
}));

vi.mock('next-auth/next', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/labels/rate-limit', () => ({ consumeWclQuota }));

const ALLOWED = { allowed: true, retryAfterSeconds: 0, unavailable: false };

describe('guardWclSpend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeWclQuota.mockResolvedValue(ALLOWED);
    getServerSession.mockResolvedValue({ user: { name: 'Player#1234' } });
  });

  it('refuses an anonymous caller before spending anything', async () => {
    getServerSession.mockResolvedValue(null);

    const refusal = await guardWclSpend(BOSS_ANALYSIS_UNITS);

    expect(refusal?.status).toBe(401);
    expect(consumeWclQuota).not.toHaveBeenCalled();
  });

  it('lets an authenticated caller through, charging what the request costs', async () => {
    await expect(guardWclSpend(BOSS_ANALYSIS_UNITS)).resolves.toBeNull();

    const [, , units] = consumeWclQuota.mock.calls[0] as [string, number, number];
    expect(units).toBe(BOSS_ANALYSIS_UNITS);
  });

  it('answers 429 with the delay to the next window once the quota is spent', async () => {
    consumeWclQuota.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 900,
      unavailable: false,
    });

    const refusal = await guardWclSpend(BOSS_ANALYSIS_UNITS);

    expect(refusal?.status).toBe(429);
    expect(refusal?.headers.get('Retry-After')).toBe('900');
  });

  // Compteur illisible : le quota échoue fermé, et 503 dit que c'est notre panne, pas un abus.
  it('answers 503 when the counter cannot be read', async () => {
    consumeWclQuota.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 3600,
      unavailable: true,
    });

    expect((await guardWclSpend(BOSS_ANALYSIS_UNITS))?.status).toBe(503);
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
