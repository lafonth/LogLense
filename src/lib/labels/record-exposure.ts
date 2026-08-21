import type { BossResult } from '@/types';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { redisAppend } from '@/lib/redis';
import { hasCorpusRoom } from './corpus';
import { buildExposure, exposureMonthKey } from './exposure';
import { hashUserId } from './identity';
import { consumeExposureQuota } from './rate-limit';

/**
 * Écrit ce que l'analyse s'apprête à montrer.
 *
 * Appelée côté serveur, et **attendue** avant que la réponse parte : une promesse laissée
 * en `void` meurt avec la fonction serverless, et l'enregistrement avec elle.
 *
 * **Ne jette jamais.** L'analyse est le produit ; la capture est ce qui le rendra meilleur
 * plus tard. Un corpus manquant se rattrape à l'analyse suivante, une analyse perdue non.
 *
 * **Échoue fermé sur l'identité.** `LABEL_SALT` absent alors qu'une session existe, on
 * n'écrit rien : se replier sur `by: null` affirmerait un anonymat faux et mélangerait dans
 * le corpus des identités salées et non salées, ce qui est irréversible.
 *
 * **N'écrit rien sans identité non plus.** Un rendu anonyme ne débite aucun quota : c'était
 * la seule écriture du corpus que rien ne bornait, et le corpus est append-only et jamais
 * purgé. Un enregistrement sans `by` n'est en outre ni déduplicable ni traçable en abus.
 */
export async function recordExposure(bosses: (BossResult | null)[]): Promise<void> {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.email ?? session?.user?.name ?? '';

    // `hashUserId` jette si le sel manque : l'exception remonte au `catch` du bas, et rien
    // n'est écrit. C'est l'échec fermé décrit en en-tête, pas un oubli.
    const by: string | null = userId ? hashUserId(userId) : null;

    // Sans identité, rien à écrire : voir l'en-tête.
    if (!by) return;

    // Un seul instant pour le lot : les rendus d'une même requête appartiennent au même mois
    // et au même instant d'exposition.
    const at = new Date().toISOString();
    const key = exposureMonthKey(at);
    const atMs = Date.parse(at);

    // Mesuré une fois pour le lot, pas une fois par boss : voir `hasCorpusRoom`.
    if (!(await hasCorpusRoom(key))) return;

    // Les décomptes de quota restent séquentiels : `consumeExposureQuota` ne prend pas de
    // coût, donc vingt boss demandent vingt `INCR` — les grouper voudrait dire changer la
    // signature du quota, et un plafond franchi par un lot compté en bloc n'est plus un
    // plafond. C'est l'écriture, elle, qui n'a aucune raison d'attendre la précédente.
    const payloads: string[] = [];
    for (const boss of bosses) {
      if (!boss) continue;

      // Le quota se compte sur l'identité hachée, jamais sur l'IP : c'est le compte qui
      // écrit dans le corpus.
      const quota = await consumeExposureQuota(by, atMs);
      // Le suivant serait refusé pour la même raison : inutile d'insister.
      if (!quota.allowed) break;

      // La provenance du DPS n'est pas passée ici : elle est portée par le résultat lui-même
      // (`character.dpsSource`). Une route qui l'affirmerait mentirait dès que le pipeline
      // change de source, ce qui est exactement ce qui est arrivé au chemin rapport.
      payloads.push(JSON.stringify(buildExposure(boss, { by, at })));
    }

    // `allSettled` et non `all` : sur un rejet, `all` rendrait la main pendant que les autres
    // `RPUSH` sont encore en vol, et la fonction serverless les emporterait avec elle. Le
    // refus d'une écriture ne doit pas coûter les autres.
    await Promise.allSettled(payloads.map((payload) => redisAppend(key, payload)));
  } catch {
    // Avalé volontairement : voir l'en-tête.
  }
}
