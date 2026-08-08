import type { NextAuthOptions } from 'next-auth';
import BattleNetProvider from 'next-auth/providers/battlenet';
import {
  DEV_SESSION_PROVIDER_ID,
  DEV_STUB_ACCESS_TOKEN,
  DEV_STUB_BATTLETAG,
  getDevSessionProviders,
} from '@/lib/dev-session';
import { redisGet } from '@/lib/redis';

const WHITELIST_KEY = 'app:whitelist';

async function fetchBattletag(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://eu.battle.net/oauth/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { battletag?: string; battleTag?: string };
    return data.battletag ?? data.battleTag ?? null;
  } catch {
    return null;
  }
}

/**
 * Dit si ce battletag a le droit d'entrer.
 *
 * Trois cas, et ils ne se confondent pas :
 *
 * - clé absente : accès ouvert, pour pouvoir se connecter avant d'avoir configuré la liste ;
 * - clé illisible ou Redis muet : accès refusé. C'est une porte d'entrée — ce qu'on n'a pas
 *   pu vérifier ne s'accorde pas. Auparavant l'erreur remontait jusqu'à NextAuth, ou pire,
 *   se lisait comme une clé absente et ouvrait tout ;
 * - clé lue : appartenance, insensible à la casse comme l'affichage du battletag.
 */
async function isAllowed(battletag: string): Promise<boolean> {
  let raw: string | null;

  try {
    raw = await redisGet(WHITELIST_KEY);
  } catch {
    return false;
  }

  if (!raw) return true;

  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return false;
    return list.some((t) => typeof t === 'string' && t.toLowerCase() === battletag.toLowerCase());
  } catch {
    return false;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    BattleNetProvider({
      clientId: (process.env.VERCEL_ENV === 'production'
        ? process.env.BLIZZARD_CLIENT_ID_PROD
        : process.env.BLIZZARD_CLIENT_ID_DEV)!,
      clientSecret: (process.env.VERCEL_ENV === 'production'
        ? process.env.BLIZZARD_CLIENT_SECRET_PROD
        : process.env.BLIZZARD_CLIENT_SECRET_DEV)!,
      issuer: 'https://eu.battle.net/oauth',
      authorization: {
        params: { scope: 'openid wow.profile' },
      },
      checks: ['state', 'nonce'],
      profile(profile: Record<string, unknown>) {
        return {
          id: String(profile.sub ?? profile.id ?? ''),
          name: (profile.battletag as string | undefined) ?? String(profile.sub ?? ''),
          email: (profile.email as string | undefined) ?? null,
          image: null,
        };
      },
    }),
    ...getDevSessionProviders(),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async signIn({ account }) {
      if (account?.provider === DEV_SESSION_PROVIDER_ID) return true;
      if (!account?.access_token) return false;
      const battletag = await fetchBattletag(account.access_token);
      if (!battletag) return false;
      return isAllowed(battletag);
    },
    async jwt({ token, account, user }) {
      if (account?.provider === DEV_SESSION_PROVIDER_ID) {
        token.accessToken = DEV_STUB_ACCESS_TOKEN;
        token.name = user?.name ?? DEV_STUB_BATTLETAG;
        return token;
      }
      if (account?.access_token) {
        token.accessToken = account.access_token;
        const tag = await fetchBattletag(account.access_token);
        if (tag) token.name = tag;
      } else if (token.accessToken && typeof token.name === 'string' && /^\d+$/.test(token.name)) {
        // Name is still a raw account ID — battletag fetch must have failed at sign-in; retry
        const tag = await fetchBattletag(token.accessToken as string);
        if (tag) token.name = tag;
      }
      return token;
    },
    session({ session, token }) {
      return {
        ...session,
        accessToken: token.accessToken as string | undefined,
        user: {
          ...session.user,
          name: (token.name as string | undefined) ?? session.user?.name,
        },
      };
    },
  },
};
