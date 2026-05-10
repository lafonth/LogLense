import { describe, expect, it, vi } from 'vitest';
import { ClaudeProvider } from '../claude';

vi.mock('@anthropic-ai/sdk', () => {
  const mockStream = {
    async *[Symbol.asyncIterator]() {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } };
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'world' } };
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
  it('streams text chunks from Claude', async () => {
    const provider = new ClaudeProvider('test-api-key');
    const stream = provider.stream('Test prompt', 'System');

    const reader = stream.getReader();
    const chunks: string[] = [];

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    expect(chunks).toEqual(['Hello ', 'world']);
  });
});
