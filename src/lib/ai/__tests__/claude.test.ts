import type { AIStreamChunk, UsageData } from '../provider';
import { describe, expect, it, vi } from 'vitest';
import { ClaudeProvider } from '../claude';

vi.mock('@anthropic-ai/sdk', () => {
  const mockStream = {
    async *[Symbol.asyncIterator]() {
      // Les trois termes d'entree separement, comme l'API les rend : l'entree neuve exclut
      // ce qui est lu ou ecrit dans le cache, et chacun se facture a un tarif different.
      yield {
        type: 'message_start',
        message: {
          usage: {
            input_tokens: 100,
            cache_creation_input_tokens: 40,
            cache_read_input_tokens: 900,
          },
        },
      };
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } };
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'world' } };
      yield { type: 'message_delta', usage: { output_tokens: 5 } };
      yield { type: 'message_stop' };
    },
  };

  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        stream: vi.fn().mockReturnValue(mockStream),
      },
    })),
  };
});

describe('claude provider', () => {
  it('streams text chunks and emits usage from Claude', async () => {
    const provider = new ClaudeProvider('test-api-key');
    const stream = provider.stream('Test prompt', 'System');

    const reader = stream.getReader();
    const chunks: AIStreamChunk[] = [];

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const textChunks = chunks
      .filter((c) => c.type === 'text')
      .map((c) => (c as { type: 'text'; content: string }).content);
    const usageChunk = chunks.find((c) => c.type === 'usage');

    expect(textChunks).toEqual(['Hello ', 'world']);
    expect(usageChunk).toBeDefined();
    expect((usageChunk as { type: 'usage'; data: UsageData }).data).toEqual({
      promptTokens: 1040,
      completionTokens: 5,
      totalTokens: 1045,
      cachedTokens: 900,
      cacheWriteTokens: 40,
      model: expect.any(String),
      contextWindow: expect.any(Number),
    });
  });
});
