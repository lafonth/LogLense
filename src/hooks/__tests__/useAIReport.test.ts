import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisResult } from '@/types';
import { useAIReport } from '@/hooks/useAIReport';

const mockAnalysisResult: AnalysisResult = {
  input: {
    characterName: 'Jumbaa',
    serverSlug: 'ysondre',
    region: 'EU',
    difficulty: 4,
    encounters: [{ id: 3306, name: 'Chimaerus' }],
  },
  bosses: [null],
  generatedAt: '2026-05-13T00:00:00Z',
};

function makeStreamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
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
      makeStreamResponse([
        sseChunk('Hello '),
        sseChunk('world'),
        sseChunk('[DONE]'),
      ])
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
