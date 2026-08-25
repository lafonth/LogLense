import type {
  AIChatChunk,
  AIProvider,
  AIStreamChunk,
  ChatTurn,
  ToolCapableProvider,
  ToolSpec,
} from './provider';
import Anthropic from '@anthropic-ai/sdk';

const CLAUDE_MODEL = 'claude-sonnet-5';
const CLAUDE_CONTEXT_WINDOW = 200000;

/**
 * Fenêtre de sortie d'un tour de chat. Plus courte que celle du rapport : une réponse de
 * chat répond à une question, elle ne rejoue pas l'analyse entière.
 */
const CHAT_MAX_TOKENS = 1200;

/** Le tableau `messages` de l'API, reconstruit depuis l'historique de la boucle. */
function toMessages(turns: ChatTurn[]): Anthropic.MessageParam[] {
  return turns.map((turn) => {
    if (turn.role === 'user') return { role: 'user' as const, content: turn.text };

    if (turn.role === 'tool') {
      return {
        role: 'user' as const,
        content: turn.results.map((r) => ({
          type: 'tool_result' as const,
          tool_use_id: r.id,
          content: r.content,
        })),
      };
    }

    const blocks: Anthropic.ContentBlockParam[] = [];
    if (turn.text) blocks.push({ type: 'text', text: turn.text });
    for (const call of turn.toolCalls) {
      blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input ?? {} });
    }
    return { role: 'assistant' as const, content: blocks };
  });
}

export class ClaudeProvider implements AIProvider, ToolCapableProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  stream(prompt: string, systemPrompt: string): ReadableStream<AIStreamChunk> {
    const client = this.client;

    return new ReadableStream<AIStreamChunk>({
      async start(controller) {
        try {
          const stream = client.messages.stream({
            model: CLAUDE_MODEL,
            max_tokens: 1500,
            // Le prompt système est fixe et fait le gros de l'entrée facturée : le mettre en
            // cache est le seul levier de coût qui ne change rien au produit.
            system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: prompt }],
          });

          let inputTokens = 0;
          let outputTokens = 0;

          for await (const event of stream) {
            if (event.type === 'message_start') {
              // `input_tokens` exclut ce qui est lu ou écrit dans le cache : sans ces deux
              // termes, l'entrée affichée fondrait dès que le cache prend.
              const usage = event.message.usage;
              inputTokens =
                usage.input_tokens +
                (usage.cache_creation_input_tokens ?? 0) +
                (usage.cache_read_input_tokens ?? 0);
            } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue({ type: 'text', content: event.delta.text });
            } else if (event.type === 'message_delta' && event.usage) {
              outputTokens = event.usage.output_tokens;
            }
          }

          if (inputTokens > 0 || outputTokens > 0) {
            controller.enqueue({
              type: 'usage',
              data: {
                promptTokens: inputTokens,
                completionTokens: outputTokens,
                totalTokens: inputTokens + outputTokens,
                model: CLAUDE_MODEL,
                contextWindow: CLAUDE_CONTEXT_WINDOW,
              },
            });
          }
        } catch (e) {
          controller.enqueue({
            type: 'text',
            content: `\n\n[Error: ${e instanceof Error ? e.message : 'Unknown error'}]`,
          });
        }

        controller.close();
      },
    });
  }

  /**
   * Un tour de la boucle de chat : le modèle répond, ou demande des outils.
   *
   * Le texte part au fil de l'eau — c'est ce que l'utilisateur lit — mais les appels d'outil
   * sont pris sur le message final plutôt que reconstitués depuis les `input_json_delta`.
   * Un JSON partiel n'est pas un argument d'outil : le décoder à la main rouvrirait un
   * parseur que le SDK tient déjà, pour rien.
   */
  streamTurn(
    turns: ChatTurn[],
    systemPrompt: string,
    tools: ToolSpec[]
  ): ReadableStream<AIChatChunk> {
    const client = this.client;

    return new ReadableStream<AIChatChunk>({
      async start(controller) {
        try {
          const stream = client.messages.stream({
            model: CLAUDE_MODEL,
            max_tokens: CHAT_MAX_TOKENS,
            // Même raison qu'au rapport : le contexte du boss est fixe pour toute la
            // conversation, et c'est lui qui fait le gros de l'entrée facturée.
            system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
            tools: tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
            })),
            messages: toMessages(turns),
          });

          let inputTokens = 0;
          let outputTokens = 0;

          for await (const event of stream) {
            if (event.type === 'message_start') {
              const usage = event.message.usage;
              inputTokens =
                usage.input_tokens +
                (usage.cache_creation_input_tokens ?? 0) +
                (usage.cache_read_input_tokens ?? 0);
            } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue({ type: 'text', content: event.delta.text });
            } else if (event.type === 'message_delta' && event.usage) {
              outputTokens = event.usage.output_tokens;
            }
          }

          const final = await stream.finalMessage();
          for (const block of final.content) {
            if (block.type === 'tool_use') {
              controller.enqueue({
                type: 'tool_call',
                call: { id: block.id, name: block.name, input: block.input },
              });
            }
          }

          if (inputTokens > 0 || outputTokens > 0) {
            controller.enqueue({
              type: 'usage',
              data: {
                promptTokens: inputTokens,
                completionTokens: outputTokens,
                totalTokens: inputTokens + outputTokens,
                model: CLAUDE_MODEL,
                contextWindow: CLAUDE_CONTEXT_WINDOW,
              },
            });
          }
        } catch (e) {
          controller.enqueue({
            type: 'text',
            content: `

[Error: ${e instanceof Error ? e.message : 'Unknown error'}]`,
          });
        }

        controller.close();
      },
    });
  }
}
