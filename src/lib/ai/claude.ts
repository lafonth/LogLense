import type { AIProvider, AIStreamChunk } from './provider';
import Anthropic from '@anthropic-ai/sdk';

const CLAUDE_MODEL = 'claude-sonnet-4-6';
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
            system: systemPrompt,
            messages: [{ role: 'user', content: prompt }],
          });

          let inputTokens = 0;
          let outputTokens = 0;

          for await (const event of stream) {
            if (event.type === 'message_start') {
              inputTokens = event.message.usage.input_tokens;
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
