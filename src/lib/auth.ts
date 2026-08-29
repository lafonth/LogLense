import type { NextAuthOptions } from 'next-auth';
import BattleNetProvider from 'next-auth/providers/battlenet';
import { decideAccess, requestAccess } from '@/lib/access';
import { blizzardCredentials } from '@/lib/blizzard-credentials';
import {
  DEV_SESSION_PROVIDER_ID,
  DEV_STUB_ACCESS_TOKEN,
  DEV_STUB_BATTLETAG,
  getDevSessionProviders,
} from '@/lib/dev-session';

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

export const authOptions: NextAuthOptions = {
  providers: [
    BattleNetProvider({
      clientId: blizzardCredentials().clientId!,
      clientSecret: blizzardCredentials().clientSecret!,
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
  pages: { error: '/' },
  callbacks: {
    /**
     * La porte. Le verdict vient d'`access.ts`, qui échoue fermé ; ici on n'ajoute qu'une
     * chose : un refus par fermeture est **consigné comme demande**.
     *
     * C'est ce qui remplace le « envoie-moi ton battletag » : le visiteur qui essaie de se
     * connecter se met de lui-même dans la file, et l'admission tient en un clic au lieu d'un
     * déploiement. `requestAccess` ne jette jamais — une exception ici ne rendrait pas un
     * refus propre mais une erreur d'authentification, et le visiteur lirait une panne là où
     * il doit lire « bêta fermée ».
     */
    async signIn({ account }) {
      if (account?.provider === DEV_SESSION_PROVIDER_ID) return true;
      if (!account?.access_token) return false;
      const battletag = await fetchBattletag(account.access_token);
      if (!battletag) return false;

      const decision = await decideAccess(battletag);
      if (!decision.allowed && decision.reason === 'closed') await requestAccess(battletag);
      return decision.allowed;
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
