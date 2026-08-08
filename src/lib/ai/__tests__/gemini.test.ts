import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiProvider } from '../gemini';
import { drain, sseResponse } from './sse';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GEMINI_MODEL;
});

function part(text: string) {
  return `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n`;
}

describe('gemini provider', () => {
  it('assembles the text even when a chunk is split across packets', async () => {
    const line = part('Hello ');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(sseResponse([line.slice(0, 25), line.slice(25), part('world')]))
    );

    const { text } = await drain(new GeminiProvider('key').stream('p', 's'));

    expect(text).toBe('Hello world');
  });

  // Le défaut que ce test épingle : la fenêtre était indexée sur le modèle demandé alors que
  // le nom rendu était celui servi — la jauge de contexte annonçait la fenêtre d'un autre.
  it('reports the served model with the context window of that same model', async () => {
    process.env.GEMINI_MODEL = 'gemini-2.0-flash-lite';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          part('hi'),
          `data: ${JSON.stringify({
            modelVersion: 'gemini-1.5-pro',
            usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 8, totalTokenCount: 48 },
          })}\n`,
        ])
      )
    );

    const { usage } = await drain(new GeminiProvider('key').stream('p', 's'));

    expect(usage?.data).toEqual({
      promptTokens: 40,
      completionTokens: 8,
      totalTokens: 48,
      model: 'gemini-1.5-pro',
      contextWindow: 2097152,
    });
  });

  it('falls back to a default window for a model it does not know', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          `data: ${JSON.stringify({
            modelVersion: 'gemini-9.9-experimental',
            usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
          })}\n`,
        ])
      )
    );

    const { usage } = await drain(new GeminiProvider('key').stream('p', 's'));

    expect(usage?.data.contextWindow).toBe(1048576);
    // Sans total annoncé, la somme des deux vaut mieux qu'un zéro.
    expect(usage?.data.totalTokens).toBe(2);
  });

  it('skips a malformed chunk instead of dropping the rest of the stream', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(sseResponse([part('a'), 'data: {not json\n', part('b')]))
    );

    const { text } = await drain(new GeminiProvider('key').stream('p', 's'));

    expect(text).toBe('ab');
  });

  it('surfaces an HTTP error with the first line of the API message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([JSON.stringify({ error: { message: 'API key not valid\nsee the docs' } })], {
          ok: false,
          status: 400,
        })
      )
    );

    const { text } = await drain(new GeminiProvider('bad').stream('p', 's'));

    expect(text).toContain('Gemini API error 400');
    expect(text).toContain('API key not valid');
    expect(text).not.toContain('see the docs');
  });

  it('surfaces a network failure in the stream', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));

    const { text } = await drain(new GeminiProvider('key').stream('p', 's'));

    expect(text).toContain('ECONNRESET');
  });
});
