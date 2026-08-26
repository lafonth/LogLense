import { afterEach, describe, expect, it, vi } from 'vitest';
import { GroqProvider } from '../groq';
import { drain, sseResponse } from './sse';

afterEach(() => {
  vi.unstubAllGlobals();
});

function delta(content: string) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n`;
}

describe('groq provider', () => {
  it('assembles the text even when a chunk is split across packets', async () => {
    const line = delta('Hello ');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(sseResponse([line.slice(0, 20), line.slice(20), delta('world')]))
    );

    const { text } = await drain(new GroqProvider('gsk_test').stream('p', 's'));

    expect(text).toBe('Hello world');
  });

  it('reports the model Groq actually served, with its own context window', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          delta('hi'),
          `data: ${JSON.stringify({
            model: 'llama-3.1-8b-instant',
            usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
          })}\n`,
          'data: [DONE]\n',
        ])
      )
    );

    const { usage } = await drain(
      new GroqProvider('gsk_test', 'llama-3.3-70b-versatile').stream('p', 's')
    );

    expect(usage?.data).toEqual({
      promptTokens: 12,
      completionTokens: 3,
      totalTokens: 15,
      cachedTokens: null,
      cacheWriteTokens: null,
      model: 'llama-3.1-8b-instant',
      contextWindow: 131072,
    });
  });

  it('sends the model the caller chose, not one from the environment', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([delta('hi')]));
    vi.stubGlobal('fetch', fetchMock);

    await drain(new GroqProvider('gsk_test', 'llama-3.1-8b-instant').stream('p', 's'));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { model: string };
    expect(body.model).toBe('llama-3.1-8b-instant');
  });

  it('skips a malformed chunk instead of dropping the rest of the stream', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(sseResponse([delta('a'), 'data: {not json\n', delta('b')]))
    );

    const { text } = await drain(new GroqProvider('gsk_test').stream('p', 's'));

    expect(text).toBe('ab');
  });

  // Un flux qui se ferme en silence sur une clé refusée laisserait l'utilisateur devant un
  // rapport vide, sans savoir que c'est sa clé qui est en cause.
  it('surfaces an HTTP error in the stream', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(sseResponse(['invalid api key'], { ok: false, status: 401 }))
    );

    const { text } = await drain(new GroqProvider('bad').stream('p', 's'));

    expect(text).toContain('Groq API error 401');
    expect(text).toContain('invalid api key');
  });

  it('surfaces a network failure in the stream', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));

    const { text } = await drain(new GroqProvider('gsk_test').stream('p', 's'));

    expect(text).toContain('ECONNRESET');
  });
});
