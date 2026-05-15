import type { NextAuthOptions } from 'next-auth';
import BattleNetProvider from 'next-auth/providers/battlenet';

export const authOptions: NextAuthOptions = {
  providers: [
    BattleNetProvider({
      clientId: process.env.BLIZZARD_CLIENT_ID!,
      clientSecret: process.env.BLIZZARD_CLIENT_SECRET!,
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
    async jwt({ token, account }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
        // Fetch battletag directly from userinfo — profile() may not receive it
        // depending on which claims Battle.net includes in the OIDC token
        try {
          const res = await fetch('https://eu.battle.net/oauth/userinfo', {
            headers: { Authorization: `Bearer ${account.access_token}` },
          });
          if (res.ok) {
            const data = (await res.json()) as { battletag?: string; battleTag?: string };
            const tag = data.battletag ?? data.battleTag;
            if (tag) token.name = tag;
          }
        } catch {
          // Non-fatal — name falls back to whatever profile() set
        }
      }
      return token;
    },
    session({ session, token }) {
      return { ...session, accessToken: token.accessToken as string | undefined };
    },
  },
};
