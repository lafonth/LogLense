import type { AIProvider, AIStreamChunk } from './provider';
import Anthropic from '@anthropic-ai/sdk';

const CLAUDE_MODEL = 'claude-sonnet-5';
const CLAUDE_CONTEXT_WINDOW = 200000;

export class ClaudeProvider implements AIProvider {
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
}
