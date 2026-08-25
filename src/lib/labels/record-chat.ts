import type { ChatTurnRecord } from './chat';
import type { ChatToolLog } from '@/lib/ai/chat-tools';
import type { BossResult } from '@/types';
import { getServerSession } from 'next-auth/next';
import { CHAT_PROMPT_VERSION } from '@/lib/ai/chat-prompt';
import { authOptions } from '@/lib/auth';
import { chatMonthKey } from './chat';
import { appendToCorpus } from './corpus';
import { hashUserId } from './identity';
import { consumeExposureQuota } from './rate-limit';

/**
 * Écrit ce qu'un tour de chat a demandé aux données.
 *
 * Pendant de `recordAdvice` côté conversation, avec les mêmes invariants : appelée côté
 * serveur, **attendue** — une promesse laissée en `void` meurt avec la fonction serverless —
 * **ne jette jamais**, et **échoue fermé sur l'identité**.
 *
 * Écrite après le tour, et non avant comme l'empreinte du rapport : ce qu'on capture ici est
 * ce que le modèle a fait, pas ce qu'il s'apprête à faire. Un tour interrompu en cours de
 * flux ne s'enregistre donc pas — c'est le bon compromis, un tour sans outils appelés
 * n'apprend rien, là où un tour tronqué en apprendrait un faux.
 *
 * Le quota est celui des expositions, comme le conseil : un tour de chat est un rendu de plus,
 * et lui donner son propre compteur ouvrirait un budget d'écriture supplémentaire pour le
 * même abus. Il est déjà borné en amont par `consumeAiQuota`.
 */
export async function recordChat(
  boss: BossResult,
  args: { provider: string; model: string | null; turn: number; logs: ChatToolLog[] }
): Promise<void> {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.email ?? session?.user?.name ?? '';

    // `hashUserId` jette si le sel manque : rien n'est écrit. Échec fermé, pas oubli.
    const by = userId ? hashUserId(userId) : '';
    if (!by) return;

    const at = new Date().toISOString();

    const quota = await consumeExposureQuota(by, Date.parse(at));
    if (!quota.allowed) return;

    const axes = [...new Set(args.logs.flatMap((l) => l.axes))];
    // Le premier suffit : un tour qui refuse deux fois le même hors-périmètre n'apprend rien
    // de plus, et deux sujets distincts dans un tour sont assez rares pour ne pas peser sur
    // une distribution.
    const declined = args.logs.find((l) => l.declined !== null)?.declined ?? null;

    const record: ChatTurnRecord = {
      v: 1,
      kind: 'chat',
      at,
      by,
      renderId: boss.renderId,
      encounterId: boss.encounterId,
      difficulty: boss.difficulty,
      specId: boss.specId,
      promptVersion: CHAT_PROMPT_VERSION,
      provider: args.provider,
      model: args.model,
      turn: args.turn,
      tools: args.logs.map((l) => l.tool),
      axes,
      declined,
      refused: args.logs.some((l) => l.refused),
      wclCalls: args.logs.reduce((sum, l) => sum + l.wclCalls, 0),
    };

    await appendToCorpus(chatMonthKey(at), JSON.stringify(record));
  } catch {
    // Avalé volontairement : voir l'en-tête.
  }
}
