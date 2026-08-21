import type { RaidRanking } from '@/lib/wcl/raid-ranking';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { redisAppend } from '@/lib/redis';
import { hasCorpusRoom } from './corpus';
import { hashUserId } from './identity';
import { buildIntraRaidPairs, intraRaidMonthKey } from './intra-raid';
import { consumeExposureQuota } from './rate-limit';

/**
 * Écrit les paires de même spec d'une pull comme classe positive de haute confiance.
 *
 * Trois règles de `recordExposure`, pour les mêmes raisons : appelée côté serveur et
 * **attendue** avant la réponse, elle **ne jette jamais**, et elle **échoue fermé sur
 * l'identité** — `hashUserId` jette sans `LABEL_SALT`, l'exception remonte au `catch` et
 * rien n'entre au corpus plutôt qu'un `by: null` menteur.
 *
 * **La quatrième, non : ici `by === null` écrit quand même.** `recordExposure` refuse un
 * rendu sans identité parce que la voie BYOK de `ai-report` en produit un par construction,
 * et qu'aucun quota ne le bornait. Le mode raid n'a pas cette voie : son unique appelant,
 * `api/raid/[code]`, passe par `guardWclSpend`, qui répond 401 sans session avant d'arriver
 * jusqu'ici. Un lot anonyme n'y est donc pas un cas de figure mais une contradiction — et
 * l'interdire coûterait une capture le jour où la route s'ouvrirait vraiment. Si elle
 * s'ouvre, c'est cette ligne qu'il faut relire : le plafond mensuel resterait alors seul à
 * borner une écriture que rien ne débite.
 *
 * Le classement lui-même n'est pas capturé : ce qui a une valeur d'étiquette, c'est la
 * paire, parce que sa comparabilité est un fait de construction et non une heuristique.
 */
export async function recordIntraRaid(ranking: RaidRanking): Promise<void> {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.email ?? session?.user?.name ?? '';
    const by: string | null = userId ? hashUserId(userId) : null;

    // Un seul instant pour le lot : les paires viennent toutes de la même pull.
    const at = new Date().toISOString();
    const key = intraRaidMonthKey(at);
    const atMs = Date.parse(at);

    const pairs = buildIntraRaidPairs(ranking, { by, at });
    if (pairs.length === 0) return;

    // Mesuré une fois pour le lot, pas une fois par paire : voir `hasCorpusRoom`.
    if (!(await hasCorpusRoom(key))) return;

    // Les décomptes de quota restent séquentiels, comme dans `recordExposure` : le quota se
    // prend une paire à la fois, et un plafond franchi par un lot compté en bloc n'est plus un
    // plafond. C'est l'écriture, elle, qui n'a aucune raison d'attendre la précédente — et une
    // pull de vingt joueurs en produit bien plus qu'une analyse ne produit de boss.
    const payloads: string[] = [];
    for (const pair of pairs) {
      if (by) {
        const quota = await consumeExposureQuota(by, atMs);
        // La suivante serait refusée pour la même raison : inutile d'insister. `break` et non
        // `return` : les paires déjà autorisées ont payé leur jeton, elles s'écrivent.
        if (!quota.allowed) break;
      }
      payloads.push(JSON.stringify(pair));
    }

    // `allSettled` et non `all` : sur un rejet, `all` rendrait la main pendant que les autres
    // `RPUSH` sont encore en vol, et la fonction serverless les emporterait avec elle. Voir
    // `recordExposure`, dont c'est le précédent.
    await Promise.allSettled(payloads.map((payload) => redisAppend(key, payload)));
  } catch {
    // Avalé volontairement : voir l'en-tête.
  }
}
