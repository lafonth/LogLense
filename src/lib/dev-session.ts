import CredentialsProvider from 'next-auth/providers/credentials';

/**
 * Development-only session stub.
 *
 * Lets a browser session be treated as authenticated without a real Battle.net
 * login, so Playwright (or a developer) can reach the logged-in UI locally.
 *
 * This must be impossible to enable in production:
 *  - `isDevSessionEnabled` checks `NODE_ENV !== 'production'` FIRST, as an
 *    independent short-circuit, so a stray `ENABLE_DEV_SESSION=1` in a
 *    production deploy can never turn this on by itself.
 *  - Only when both that check and the explicit opt-in env var pass does the
 *    Credentials provider get added to the NextAuth `providers` array.
 */

export const DEV_SESSION_PROVIDER_ID = 'dev-session';
export const DEV_STUB_ACCESS_TOKEN = 'dev-stub-token';
export const DEV_STUB_BATTLETAG = 'DevUser#0000';

export interface DevFixtureCharacter {
  id: number;
  name: string;
  realmName: string;
  realmSlug: string;
  class: string;
  classId: number;
  level: number;
  faction: string;
}

export const DEV_FIXTURE_CHARACTERS: DevFixtureCharacter[] = [
  {
    id: 1,
    name: 'Devblade',
    realmName: 'Ysondre',
    realmSlug: 'ysondre',
    class: 'Warrior',
    classId: 1,
    level: 80,
    faction: 'HORDE',
  },
  {
    id: 2,
    name: 'Devheal',
    realmName: 'Ysondre',
    realmSlug: 'ysondre',
    class: 'Priest',
    classId: 5,
    level: 80,
    faction: 'HORDE',
  },
];

export function isDevSessionEnabled(): boolean {
  // NODE_ENV check first and independent: a misconfigured deploy that only
  // sets ENABLE_DEV_SESSION cannot enable this in production.
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.ENABLE_DEV_SESSION === '1';
}

export function getDevSessionProviders() {
  if (!isDevSessionEnabled()) return [];

  return [
    CredentialsProvider({
      id: DEV_SESSION_PROVIDER_ID,
      name: 'Dev Session',
      credentials: {},
      async authorize() {
        return { id: 'dev-stub-user', name: DEV_STUB_BATTLETAG, email: null };
      },
    }),
  ];
}
