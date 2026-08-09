import type { PoolObservation } from './pool';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { redisAppend } from '@/lib/redis';
import { hasCorpusRoom, POOL_MONTH_CAP } from './corpus';
import { hashUserId } from './identity';
import { buildPoolRecords, poolMonthKey } from './pool';
import { consumeExposureQuota } from './rate-limit';

/**
 * Écrit le vivier d'une analyse au corpus, écartés compris.
 *
 * Mêmes règles que `recordExposure` et `recordIntraRaid`, pour les mêmes raisons : appelée
 * côté serveur et **attendue** avant la réponse — sur un runtime serverless une promesse non
 * attendue part avec la fonction — elle **ne jette jamais**, et elle **échoue fermé sur
 * l'identité** : `hashUserId` jette sans `LABEL_SALT`, l'exception remonte au `catch`, et
 * rien n'entre au corpus plutôt qu'un `by: null` menteur.
 *
 * Le plafond, lui, échoue **ouvert au sens de l'analyse** : plein, il refuse l'écriture et
 * rend la main sans rien casser. Une capture manquée est un regret, une analyse cassée par
 * la capture est une régression.
 */
export async function recordPool(
  observations: PoolObservation[],
  context: {
    encounterId: number;
    difficulty: number;
    specId: number;
    subject: { code: string; fightID: number; ilvl: number; killTimeMs: number };
  }
): Promise<void> {
  try {
    if (observations.length === 0) return;

    const session = await getServerSession(authOptions);
    const userId = session?.user?.email ?? session?.user?.name ?? '';
    const by: string | null = userId ? hashUserId(userId) : null;

    // Un seul instant pour le lot : les candidats viennent tous de la même analyse, et la
    // semaine du tier — la clé de ce flux — doit être la même pour tous.
    const at = new Date().toISOString();
    const key = poolMonthKey(at);
    const atMs = Date.parse(at);

    const records = buildPoolRecords(observations, { ...context, by, at });

    // Mesuré une fois pour le lot, pas une fois par candidat : voir `hasCorpusRoom`.
    if (!(await hasCorpusRoom(key, POOL_MONTH_CAP))) return;

    // Un seul jeton pour toute l'analyse, pas un par candidat. Deux raisons : le quota borne
    // des analyses, et une douzaine de jetons par analyse rationnerait l'usage au lieu de
    // borner l'abus ; surtout, un lot coupé en son milieu écrirait un vivier amputé de ses
    // écartés — exactement l'observation biaisée que ce flux existe pour éviter.
    if (by && !(await consumeExposureQuota(by, atMs)).allowed) return;

    for (const record of records) {
      await redisAppend(key, JSON.stringify(record));
    }
  } catch {
    // Avalé volontairement : voir l'en-tête.
  }
}
