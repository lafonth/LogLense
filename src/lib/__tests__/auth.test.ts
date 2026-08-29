import type { Account } from 'next-auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCESS_PENDING_KEY } from '@/lib/access';
import { authOptions } from '@/lib/auth';
import { DEV_SESSION_PROVIDER_ID } from '@/lib/dev-session';
import { consumeStrictQuota } from '@/lib/labels/rate-limit';
import { redisGet, redisHGet, redisHLen, redisHSet } from '@/lib/redis';

/**
 * Redis est simulé, `access.ts` ne l'est pas.
 *
 * La porte est ce que ces deux modules font ensemble ; couper `access.ts` ici ne testerait
 * plus que l'existence de son appel. Le stub global de `fetch` couvrirait bien les appels REST
 * d'Upstash, mais il rendrait `undefined` à toutes les lectures — soit exactement l'absence
 * qu'on veut distinguer d'une panne.
 */
vi.mock('@/lib/redis', () => ({
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  redisHGet: vi.fn(),
  redisHSet: vi.fn(),
  redisHDel: vi.fn(),
  redisHLen: vi.fn(),
  redisHGetAll: vi.fn(),
}));
vi.mock('@/lib/labels/rate-limit', () => ({ consumeStrictQuota: vi.fn() }));

const BATTLETAG = 'Jumbaa#1234';

function account(overrides: Partial<Account> = {}): Account {
  return {
    provider: 'battlenet',
    type: 'oauth',
    providerAccountId: 'abc',
    access_token: 'bnet-token',
    ...overrides,
  } as Account;
}

/** `signIn` reçoit bien d'autres champs que ceux qu'il lit ; on ne fournit que ceux-là. */
async function signIn(acc: Account | null) {
  const callback = authOptions.callbacks!.signIn!;
  return callback({ account: acc } as Parameters<typeof callback>[0]);
}

function mockUserinfo(body: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('BETA_ALLOWLIST', '');
  vi.stubEnv('ADMIN_BATTLETAGS', '');
  mockUserinfo({ battletag: BATTLETAG });
  vi.mocked(redisGet).mockResolvedValue(null);
  vi.mocked(redisHGet).mockResolvedValue(null);
  vi.mocked(redisHSet).mockResolvedValue(true);
  vi.mocked(redisHLen).mockResolvedValue(0);
  vi.mocked(consumeStrictQuota).mockResolvedValue({
    allowed: true,
    retryAfterSeconds: 0,
    unavailable: false,
    consumed: 1,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('signIn', () => {
  it('lets the dev provider through without touching Battle.net', async () => {
    await expect(signIn(account({ provider: DEV_SESSION_PROVIDER_ID }))).resolves.toBe(true);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('refuses an account with no access token', async () => {
    await expect(signIn(account({ access_token: undefined }))).resolves.toBe(false);
    await expect(signIn(null)).resolves.toBe(false);
  });

  it('refuses when Battle.net will not name the account', async () => {
    mockUserinfo({}, false);
    await expect(signIn(account())).resolves.toBe(false);
  });

  // La faute classique du motif : une variable oubliée ne doit jamais ouvrir l'accès à tous.
  it('closes access to everyone when the allowlist is unset', async () => {
    vi.stubEnv('BETA_ALLOWLIST', '');
    await expect(signIn(account())).resolves.toBe(false);
  });

  it('admits a listed battletag whatever its case', async () => {
    vi.stubEnv('BETA_ALLOWLIST', 'jumbaa#1234,Other#1');
    await expect(signIn(account())).resolves.toBe(true);
  });

  it('refuses a battletag that is not on the list', async () => {
    vi.stubEnv('BETA_ALLOWLIST', 'Other#1');
    await expect(signIn(account())).resolves.toBe(false);
  });

  it('ignores stray whitespace and empty entries in the list', async () => {
    vi.stubEnv('BETA_ALLOWLIST', ' , Jumbaa#1234 , ');
    await expect(signIn(account())).resolves.toBe(true);
  });

  it('admits a battletag admitted from the admin screen', async () => {
    vi.mocked(redisHGet).mockResolvedValue('{"tag":"Jumbaa#1234"}');
    await expect(signIn(account())).resolves.toBe(true);
  });

  // Ce qui remplace le « envoie-moi ton battletag » : le refus met de lui-même dans la file.
  it('records a request when it refuses a closed door', async () => {
    await expect(signIn(account())).resolves.toBe(false);
    expect(vi.mocked(redisHSet)).toHaveBeenCalledWith(
      ACCESS_PENDING_KEY,
      'jumbaa#1234',
      expect.stringContaining(BATTLETAG)
    );
  });

  // Une panne se refuse comme une porte fermée, mais ne se consigne pas : rien n'a été lu,
  // donc rien ne dit que ce visiteur n'était pas déjà membre.
  it('refuses without recording when Redis is down', async () => {
    vi.mocked(redisGet).mockRejectedValue(new Error('down'));
    await expect(signIn(account())).resolves.toBe(false);
    expect(vi.mocked(redisHSet)).not.toHaveBeenCalled();
  });
});
