import type { Account } from 'next-auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authOptions } from '@/lib/auth';
import { DEV_SESSION_PROVIDER_ID } from '@/lib/dev-session';

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
  vi.stubEnv('BETA_ALLOWLIST', '');
  mockUserinfo({ battletag: BATTLETAG });
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
});
