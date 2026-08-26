import type { AnalysisResult } from '@/types';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAIReport } from '@/hooks/useAIReport';

const mockAnalysisResult: AnalysisResult = {
  input: {
    characterName: 'Jumbaa',
    serverSlug: 'ysondre',
    region: 'EU',
    difficulty: 4,
    encounters: [{ id: 3306, name: 'Chimaerus' }],
    specId: 103,
  },
  bosses: [null],
  generatedAt: '2026-05-13T00:00:00Z',
};

function makeStreamResponse(chunks: (string | Uint8Array)[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });
  return { ok: true, body: stream } as unknown as Response;
}

function sseChunk(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n`;
}

describe('useAIReport', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts in idle state', () => {
    const { result } = renderHook(() => useAIReport());
    expect(result.current.text).toBe('');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.usage).toBeNull();
  });

  it('streams text chunks and sets loading=false when done', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeStreamResponse([sseChunk('Hello '), sseChunk('world'), sseChunk('[DONE]')])
    );

    const { result } = renderHook(() => useAIReport());

    await act(async () => {
      await result.current.start(mockAnalysisResult, 'test-key', 'groq');
    });

    expect(result.current.text).toBe('Hello world');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('parses usage event and exposes it', async () => {
    const usageData = {
      promptTokens: 1000,
      completionTokens: 200,
      totalTokens: 1200,
      cachedTokens: null,
      cacheWriteTokens: null,
      model: 'test-model',
      contextWindow: 8192,
    };
    vi.mocked(fetch).mockResolvedValue(
      makeStreamResponse([
        sseChunk('Analysis complete.'),
        sseChunk({ _meta: 'usage', ...usageData }),
        sseChunk('[DONE]'),
      ])
    );

    const { result } = renderHook(() => useAIReport());

    await act(async () => {
      await result.current.start(mockAnalysisResult, 'test-key', 'groq');
    });

    expect(result.current.text).toBe('Analysis complete.');
    expect(result.current.usage).toMatchObject(usageData);
  });

  it('sets error when API returns non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      headers: new Headers(),
      json: () => Promise.resolve({ error: 'Invalid API key' }),
    } as unknown as Response);

    const { result } = renderHook(() => useAIReport());

    await act(async () => {
      await result.current.start(mockAnalysisResult, 'bad-key', 'groq');
    });

    expect(result.current.error).toBe('Invalid API key');
    expect(result.current.loading).toBe(false);
  });

  it('sets error on network failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAIReport());

    await act(async () => {
      await result.current.start(mockAnalysisResult, 'test-key', 'groq');
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.loading).toBe(false);
  });

  it('reset() clears text, error, and usage', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeStreamResponse([sseChunk('Some text'), sseChunk('[DONE]')])
    );

    const { result } = renderHook(() => useAIReport());

    await act(async () => {
      await result.current.start(mockAnalysisResult, 'test-key', 'groq');
    });

    expect(result.current.text).toBe('Some text');

    act(() => {
      result.current.reset();
    });

    expect(result.current.text).toBe('');
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  /*
   * Le défaut que ces trois cas ferment : une trame SSE coupée par la frontière de chunk
   * partait en deux `JSON.parse` en échec, tous deux avalés par le `catch` — du texte perdu
   * sans qu'aucune erreur ne le dise.
   */
  it('recolle une trame SSE coupée entre deux chunks', async () => {
    const frame = sseChunk('Hello world');
    const cut = Math.floor(frame.length / 2);
    vi.mocked(fetch).mockResolvedValue(
      makeStreamResponse([frame.slice(0, cut), frame.slice(cut), sseChunk('[DONE]')])
    );

    const { result } = renderHook(() => useAIReport());

    await act(async () => {
      await result.current.start(mockAnalysisResult, 'test-key', 'groq');
    });

    expect(result.current.text).toBe('Hello world');
    expect(result.current.error).toBeNull();
  });

  it('lit la dernière trame même sans saut de ligne final', async () => {
    vi.mocked(fetch).mockResolvedValue(makeStreamResponse([sseChunk('first '), 'data: "last"']));

    const { result } = renderHook(() => useAIReport());

    await act(async () => {
      await result.current.start(mockAnalysisResult, 'test-key', 'groq');
    });

    expect(result.current.text).toBe('first last');
  });

  it('recolle un caractère multi-octets coupé entre deux chunks', async () => {
    const frame = sseChunk('été');
    const bytes = new TextEncoder().encode(frame);
    // La coupure tombe au milieu des deux octets du « é ».
    const cut = bytes.length - 3;
    vi.mocked(fetch).mockResolvedValue(makeStreamResponse([bytes.slice(0, cut), bytes.slice(cut)]));

    const { result } = renderHook(() => useAIReport());

    await act(async () => {
      await result.current.start(mockAnalysisResult, 'test-key', 'groq');
    });

    expect(result.current.text).toBe('été');
  });

  it('does not set error when aborted (AbortError is swallowed)', async () => {
    vi.mocked(fetch).mockRejectedValue(
      Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' })
    );

    const { result } = renderHook(() => useAIReport());

    await act(async () => {
      await result.current.start(mockAnalysisResult, 'test-key', 'groq');
    });

    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
