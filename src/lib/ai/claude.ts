import type { AIProvider } from './provider';
import Anthropic from '@anthropic-ai/sdk';

export class ClaudeProvider implements AIProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  stream(prompt: string, systemPrompt: string): ReadableStream<string> {
    const client = this.client;

    return new ReadableStream<string>({
      async start(controller) {
        try {
          const stream = client.messages.stream({
            model: 'claude-sonnet-4-6',
            max_tokens: 1500,
            system: systemPrompt,
            messages: [{ role: 'user', content: prompt }],
          });

          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue(event.delta.text);
            }
          }
        } catch (e) {
          controller.enqueue(`\n\n[Error: ${e instanceof Error ? e.message : 'Unknown error'}]`);
        }

        controller.close();
      },
    });
  }
}
