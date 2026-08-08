import type { Account } from 'next-auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authOptions } from '@/lib/auth';
import { DEV_SESSION_PROVIDER_ID } from '@/lib/dev-session';
import { redisGet } from '@/lib/redis';

vi.mock('@/lib/redis', () => ({ redisGet: vi.fn() }));

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
  vi.mocked(redisGet).mockReset().mockResolvedValue(null);
  mockUserinfo({ battletag: BATTLETAG });
});

afterEach(() => {
  vi.unstubAllGlobals();
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

  // L'absence de clé est un état voulu : elle permet de se connecter avant d'avoir configuré
  // la liste.
  it('opens access when no whitelist is configured', async () => {
    vi.mocked(redisGet).mockResolvedValue(null);
    await expect(signIn(account())).resolves.toBe(true);
  });

  it('admits a listed battletag whatever its case', async () => {
    vi.mocked(redisGet).mockResolvedValue(JSON.stringify(['jumbaa#1234', 'Other#1']));
    await expect(signIn(account())).resolves.toBe(true);
  });

  it('refuses a battletag that is not on the list', async () => {
    vi.mocked(redisGet).mockResolvedValue(JSON.stringify(['Other#1']));
    await expect(signIn(account())).resolves.toBe(false);
  });

  // Le cœur de la correction : une panne de Redis se lisait comme « pas de liste », donc
  // comme un accès ouvert. Ce qu'on n'a pas pu vérifier ne s'accorde pas.
  it('refuses when the whitelist cannot be read', async () => {
    vi.mocked(redisGet).mockRejectedValue(new Error('upstash down'));
    await expect(signIn(account())).resolves.toBe(false);
  });

  it('refuses on a whitelist that is not a list of names', async () => {
    vi.mocked(redisGet).mockResolvedValue('{ not json');
    await expect(signIn(account())).resolves.toBe(false);

    vi.mocked(redisGet).mockResolvedValue(JSON.stringify({ jumbaa: true }));
    await expect(signIn(account())).resolves.toBe(false);
  });
});
