import type { AdviceRecord } from './report';
import type { BossResult } from '@/types';
import { getServerSession } from 'next-auth/next';
import { coveredAxes, PROMPT_VERSION } from '@/lib/ai/prompt';
import { authOptions } from '@/lib/auth';
import { getTalentNodes } from '@/lib/talent-loader';
import { appendToCorpus } from './corpus';
import { hashUserId } from './identity';
import { consumeExposureQuota } from './rate-limit';
import { reportMonthKey } from './report';

/**
 * Écrit ce que le rapport IA s'apprête à conseiller.
 *
 * Appelée côté serveur et **attendue** avant que le flux parte : une promesse laissée en
 * `void` meurt avec la fonction serverless, et l'empreinte avec elle.
 *
 * **Ne jette jamais**, et **échoue fermé sur l'identité** — mêmes raisons que
 * `recordExposure`, dont ceci est le pendant côté conseil.
 *
 * Le quota est celui des expositions : un rapport IA est un rendu de plus, et lui donner son
 * propre compteur ouvrirait un budget d'écriture supplémentaire pour le même abus.
 */
export async function recordAdvice(
  boss: BossResult,
  args: { provider: string; model: string | null }
): Promise<void> {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.email ?? session?.user?.name ?? '';

    // `hashUserId` jette si le sel manque : rien n'est écrit. Échec fermé, pas oubli.
    const by: string | null = userId ? hashUserId(userId) : null;

    const at = new Date().toISOString();

    if (by) {
      const quota = await consumeExposureQuota(by, Date.parse(at));
      if (!quota.allowed) return;
    }

    const record: AdviceRecord = {
      v: 3,
      kind: 'advice',
      at,
      by,
      renderId: boss.renderId,
      encounterId: boss.encounterId,
      difficulty: boss.difficulty,
      specId: boss.specId,
      promptVersion: PROMPT_VERSION,
      provider: args.provider,
      model: args.model,
      axes: coveredAxes(boss, getTalentNodes(boss.specId)),
    };

    await appendToCorpus(reportMonthKey(at), JSON.stringify(record));
  } catch {
    // Avalé volontairement : voir l'en-tête.
  }
}
