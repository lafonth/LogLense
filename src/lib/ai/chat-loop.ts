import type { ChatToolContext, ChatToolLog } from './chat-tools';
import type { AIStreamChunk, ChatTurn, ToolCall, ToolCapableProvider, UsageData } from './provider';

import { CHAT_TOOLS, runChatTool } from './chat-tools';

/**
 * La boucle agentique du chat : le modèle parle, demande des outils, relit ce qu'ils rendent,
 * et reprend la parole.
 *
 * Elle sort un flux de {@link AIStreamChunk} et non de `AIChatChunk` : les appels d'outil sont
 * consommés ici, pas devant l'utilisateur. La route SSE et le hook du rapport peuvent donc être
 * repris tels quels — un tour de chat se lit exactement comme un rapport qui s'écrit.
 *
 * Les outils s'exécutent en série, jamais en `Promise.all` : une promotion pousse sa référence
 * dans `context.promoted`, et deux appels concurrents sur le même nom paieraient deux fois.
 */

/**
 * Tours d'outils autorisés avant que la boucle ne rende la main.
 *
 * Quatre, parce qu'il en faut trois pour la séquence la plus longue qu'on ait dessinée —
 * resélectionner, promouvoir, comparer — et un de marge. La borne n'est pas une optimisation :
 * sans elle, un modèle qui reformule sans fin le même filtre tourne jusqu'au délai de la
 * fonction, et chaque tour relit le contexte du boss.
 */
export const MAX_TOOL_ROUNDS = 4;

/**
 * Ce que l'utilisateur lit quand la boucle s'arrête sur sa borne.
 *
 * Dit ce qui s'est passé plutôt que de laisser une réponse tronquée : le tour s'est terminé sur
 * une demande d'outil, il n'y a donc pas de phrase de conclusion à attendre.
 */
const TOOL_BUDGET_NOTE =
  '\n\n_Stopped after four rounds of tool calls. Ask again and I will pick it up from here._';

/** Un `tool_result` doit répondre à chaque `tool_use`, y compris à un nom que nous ne servons pas. */
const UNKNOWN_TOOL = JSON.stringify({
  error: 'unknown-tool',
  message: 'No such tool. Use one of the four described in the instructions.',
});

export interface ChatLoopArgs {
  provider: ToolCapableProvider;
  systemPrompt: string;
  /** L'historique de la conversation, dernier message utilisateur compris. */
  history: ChatTurn[];
  context: ChatToolContext;
  /** Appelé pour chaque outil exécuté, dans l'ordre. C'est ce que le corpus enregistre. */
  onLog: (log: ChatToolLog) => void;
}

/** Somme deux relevés d'usage. Le modèle et la fenêtre du dernier tour l'emportent. */
function addUsage(total: UsageData | null, next: UsageData): UsageData {
  if (!total) return next;
  return {
    ...next,
    promptTokens: total.promptTokens + next.promptTokens,
    completionTokens: total.completionTokens + next.completionTokens,
    totalTokens: total.totalTokens + next.totalTokens,
  };
}

export function runChatLoop(args: ChatLoopArgs): ReadableStream<AIStreamChunk> {
  const { provider, systemPrompt, context, onLog } = args;
  const turns: ChatTurn[] = [...args.history];

  return new ReadableStream<AIStreamChunk>({
    async start(controller) {
      // Cumulé sur toute la boucle et émis une seule fois : un tour outillé consomme trois ou
      // quatre appels au modèle, et n'en montrer que le dernier ferait passer une conversation
      // coûteuse pour une conversation légère.
      let usage: UsageData | null = null;

      try {
        for (let round = 0; ; round++) {
          let text = '';
          const calls: ToolCall[] = [];

          const reader = provider.streamTurn(turns, systemPrompt, CHAT_TOOLS).getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value.type === 'text') {
              text += value.content;
              controller.enqueue(value);
            } else if (value.type === 'usage') {
              usage = addUsage(usage, value.data);
            } else {
              calls.push(value.call);
            }
          }

          turns.push({ role: 'assistant', text, toolCalls: calls });
          if (calls.length === 0) break;

          if (round >= MAX_TOOL_ROUNDS) {
            controller.enqueue({ type: 'text', content: TOOL_BUDGET_NOTE });
            break;
          }

          const results = [];
          for (const call of calls) {
            const outcome = await runChatTool(context, call);
            if (outcome) onLog(outcome.log);
            results.push({
              id: call.id,
              name: call.name,
              content: outcome?.content ?? UNKNOWN_TOOL,
            });
          }
          turns.push({ role: 'tool', results });
        }
      } catch (e) {
        // Même traitement que le rapport : l'erreur s'écrit dans le flux, à la suite de ce qui a
        // déjà été lu. Couper la connexion laisserait une réponse à moitié rendue sans rien en dire.
        controller.enqueue({
          type: 'text',
          content: `\n\n[Error: ${e instanceof Error ? e.message : 'Unknown error'}]`,
        });
      }

      if (usage) controller.enqueue({ type: 'usage', data: usage });
      controller.close();
    },
  });
}
