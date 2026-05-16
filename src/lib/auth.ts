import type { NextAuthOptions } from 'next-auth';
import BattleNetProvider from 'next-auth/providers/battlenet';
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

async function isAllowed(battletag: string): Promise<boolean> {
  const raw = await redisGet(WHITELIST_KEY);
  // No whitelist key = open access (lets you log in before configuring)
  if (!raw) return true;
  const list = JSON.parse(raw) as string[];
  return list.some((t) => t.toLowerCase() === battletag.toLowerCase());
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
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async signIn({ account }) {
      if (!account?.access_token) return false;
      const battletag = await fetchBattletag(account.access_token);
      if (!battletag) return false;
      return isAllowed(battletag);
    },
    async jwt({ token, account }) {
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
