import type { Account } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCESS_PENDING_KEY } from '@/lib/access';
import { ACCESS_RECHECK_MS, authOptions } from '@/lib/auth';
import {
  DEV_SESSION_PROVIDER_ID,
  DEV_STUB_ACCESS_TOKEN,
  DEV_STUB_BATTLETAG,
} from '@/lib/dev-session';
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

/** Le rappel `jwt` reçoit plus de champs qu'il n'en lit ; on ne fournit que ceux-là. */
async function jwt(args: { token: JWT; account?: Account | null; user?: { name?: string } }) {
  const callback = authOptions.callbacks!.jwt!;
  return callback(args as Parameters<typeof callback>[0]);
}

/** Un jeton de session déjà ouverte, daté il y a `agoMs`. */
function openToken(agoMs: number): JWT {
  return { accessToken: 'bnet-token', name: BATTLETAG, accessCheckedAt: Date.now() - agoMs };
}

describe('jwt — re-vérification de la porte', () => {
  it('dates the door on sign-in, so the first request does not re-read it', async () => {
    const before = Date.now();
    const token = await jwt({ token: {} as JWT, account: account() });
    expect(token.accessCheckedAt).toBeGreaterThanOrEqual(before);
    expect(vi.mocked(redisGet)).not.toHaveBeenCalled();
  });

  // Le point de tout le mécanisme : une lecture par quart d'heure, pas une par requête.
  it('does not re-read Redis inside the window', async () => {
    const fresh = openToken(ACCESS_RECHECK_MS - 1000);
    const dated = fresh.accessCheckedAt;
    const token = await jwt({ token: fresh });
    expect(vi.mocked(redisGet)).not.toHaveBeenCalled();
    expect(token.accessCheckedAt).toBe(dated);
  });

  it('re-reads the door once the window has passed, and re-dates it', async () => {
    vi.mocked(redisHGet).mockResolvedValue('{"tag":"Jumbaa#1234"}');
    const stale = openToken(ACCESS_RECHECK_MS + 1000);
    const before = Date.now();
    const token = await jwt({ token: stale });
    expect(vi.mocked(redisGet)).toHaveBeenCalled();
    expect(token.accessCheckedAt).toBeGreaterThanOrEqual(before);
  });

  // Un jeton d'avant cette version n'a pas de date : il doit repasser devant la porte, pas
  // hériter d'un sursis.
  it('re-reads a token that carries no date at all', async () => {
    await expect(
      jwt({ token: { accessToken: 'bnet-token', name: BATTLETAG } as JWT })
    ).rejects.toThrow();
    expect(vi.mocked(redisGet)).toHaveBeenCalled();
  });

  /**
   * Jeter est le moyen de couper la session : NextAuth efface le cookie et rend un corps
   * vide. Rendre un jeton amputé laisserait un client qui se croit connecté.
   */
  it('throws when the member has been revoked', async () => {
    vi.mocked(redisHGet).mockResolvedValue(null);
    await expect(jwt({ token: openToken(ACCESS_RECHECK_MS + 1000) })).rejects.toThrow(
      /Access revoked/
    );
  });

  it('throws when the open window has closed behind the session', async () => {
    vi.mocked(redisGet).mockResolvedValue(
      JSON.stringify({ mode: 'open', until: new Date(Date.now() - 1000).toISOString() })
    );
    vi.mocked(redisHGet).mockResolvedValue(null);
    await expect(jwt({ token: openToken(ACCESS_RECHECK_MS + 1000) })).rejects.toThrow();
  });

  it('keeps the session open while the window is still open', async () => {
    vi.mocked(redisGet).mockResolvedValue(
      JSON.stringify({ mode: 'open', until: new Date(Date.now() + 86_400_000).toISOString() })
    );
    await expect(jwt({ token: openToken(ACCESS_RECHECK_MS + 1000) })).resolves.toBeTruthy();
  });

  /**
   * Le seul endroit du produit qui échoue **ouvert**, et c'est délibéré : à l'entrée une
   * panne doit refuser, mais sur une session déjà ouverte elle déconnecterait tout le monde
   * pour une seconde d'Upstash, sans rien protéger.
   */
  it('does not cut an open session when Redis is down, and does not re-date it', async () => {
    vi.mocked(redisGet).mockRejectedValue(new Error('down'));
    const stale = openToken(ACCESS_RECHECK_MS + 1000);
    const dated = stale.accessCheckedAt;
    const token = await jwt({ token: stale });
    expect(token.accessCheckedAt).toBe(dated);
  });

  it('leaves the dev session alone', async () => {
    const token = await jwt({
      token: { accessToken: DEV_STUB_ACCESS_TOKEN, name: DEV_STUB_BATTLETAG } as JWT,
    });
    expect(vi.mocked(redisGet)).not.toHaveBeenCalled();
    expect(token.accessCheckedAt).toBeUndefined();
  });

  // Un identifiant brut n'est pas un battletag : le soumettre à la porte reviendrait à
  // révoquer un membre pour une panne de Battle.net.
  it('does not judge a name the battletag fetch has not resolved yet', async () => {
    mockUserinfo({}, false);
    const token = await jwt({ token: { accessToken: 'bnet-token', name: '12345' } as JWT });
    expect(vi.mocked(redisGet)).not.toHaveBeenCalled();
    expect(token.name).toBe('12345');
  });

  // …mais dès que la reprise le résout, la porte reprend son droit sur la même requête.
  it('judges the battletag as soon as the retry resolves it', async () => {
    vi.mocked(redisHGet).mockResolvedValue(null);
    await expect(
      jwt({ token: { accessToken: 'bnet-token', name: '12345' } as JWT })
    ).rejects.toThrow(/Access revoked/);
  });

  it('admits an admin without reading Redis at all', async () => {
    vi.stubEnv('ADMIN_BATTLETAGS', BATTLETAG);
    const token = await jwt({ token: openToken(ACCESS_RECHECK_MS + 1000) });
    expect(vi.mocked(redisGet)).not.toHaveBeenCalled();
    expect(token.accessCheckedAt).toBeGreaterThan(0);
  });
});
