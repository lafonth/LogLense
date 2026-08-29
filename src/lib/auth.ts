import type { NextAuthOptions } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import BattleNetProvider from 'next-auth/providers/battlenet';
import { decideAccess, isBattletag, requestAccess } from '@/lib/access';
import { blizzardCredentials } from '@/lib/blizzard-credentials';
import {
  DEV_SESSION_PROVIDER_ID,
  DEV_STUB_ACCESS_TOKEN,
  DEV_STUB_BATTLETAG,
  getDevSessionProviders,
} from '@/lib/dev-session';

/**
 * Délai maximal entre deux verdicts de la porte, pour une session déjà ouverte.
 *
 * Le jeton vit trente jours ; sans cette re-vérification, `revoke` et la fermeture de la
 * fenêtre ne prendraient effet qu'à son expiration — un membre retiré resterait un mois
 * dedans. Quinze minutes borne ce sursis, pour une lecture Redis par session et par quart
 * d'heure : le rappel `jwt` tourne à chaque lecture de session, dater la vérification dans le
 * jeton est ce qui l'empêche de coûter une lecture par requête.
 */
export const ACCESS_RECHECK_MS = 15 * 60 * 1000;

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

function checkedAtOf(token: JWT): number {
  const at = token.accessCheckedAt;
  return typeof at === 'number' && Number.isFinite(at) ? at : 0;
}

/**
 * Repasse une session ouverte devant la porte, au plus une fois par `ACCESS_RECHECK_MS`.
 *
 * **Jeter est le moyen de couper la session**, et non un accident : la route `session` de
 * NextAuth traite une exception du rappel `jwt` en effaçant le cookie et en rendant un corps
 * vide — donc `getServerSession` rend `null`, et `useSession` repasse à `unauthenticated`.
 * Rendre un jeton amputé laisserait au contraire une session non vide, c'est-à-dire un client
 * qui se croit connecté devant des routes qui le refusent.
 *
 * Deux verdicts ne coupent rien :
 *
 * - **Redis muet** (`unavailable`). Ici seulement, on s'écarte du « échoue fermé » d'
 *   `access.ts` : à l'entrée, une panne doit refuser ; sur une session déjà ouverte, elle
 *   déconnecterait tout le monde pour une seconde d'Upstash, sans rien protéger — le membre
 *   révoqué n'y gagne que ce qu'il avait déjà avant cette fonction, le reste de la vie du
 *   jeton. La date n'est pas rafraîchie : la requête suivante réessaie.
 * - **Un nom qui n'est pas un battletag** — l'identifiant brut que le rappel `jwt` n'a pas
 *   encore réussi à résoudre. Le soumettre à la porte reviendrait à révoquer un membre pour
 *   une panne de Battle.net.
 */
async function recheckAccess(token: JWT, nowMs: number): Promise<void> {
  if (token.accessToken === DEV_STUB_ACCESS_TOKEN) return;

  const tag = typeof token.name === 'string' ? token.name : '';
  if (!isBattletag(tag)) return;
  if (nowMs - checkedAtOf(token) < ACCESS_RECHECK_MS) return;

  const decision = await decideAccess(tag, nowMs);
  if (decision.reason === 'unavailable') return;
  if (!decision.allowed) throw new Error(`Access revoked for ${tag}`);

  token.accessCheckedAt = nowMs;
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
        // `signIn` vient de rendre son verdict sur ce compte : la porte est vérifiée, il ne
        // reste qu'à dater — sans quoi la toute première requête la reconsulterait.
        token.accessCheckedAt = Date.now();
        return token;
      }
      if (token.accessToken && typeof token.name === 'string' && /^\d+$/.test(token.name)) {
        // Name is still a raw account ID — battletag fetch must have failed at sign-in; retry
        const tag = await fetchBattletag(token.accessToken as string);
        if (tag) token.name = tag;
      }
      await recheckAccess(token, Date.now());
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
