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
 * Mêmes règles que `recordExposure`, pour les mêmes raisons : appelée côté serveur et
 * **attendue** avant la réponse, elle **ne jette jamais**, et elle **échoue fermé sur
 * l'identité** — `hashUserId` jette sans `LABEL_SALT`, l'exception remonte au `catch` et
 * rien n'entre au corpus plutôt qu'un `by: null` menteur.
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

    for (const pair of pairs) {
      if (by) {
        const quota = await consumeExposureQuota(by, atMs);
        // La suivante serait refusée pour la même raison : inutile d'insister.
        if (!quota.allowed) return;
      }
      await redisAppend(key, JSON.stringify(pair));
    }
  } catch {
    // Avalé volontairement : voir l'en-tête.
  }
}
