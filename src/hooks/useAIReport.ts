'use client';

import type { AnalysisResult } from '@/types';
import { useCallback, useRef, useState } from 'react';

export function useAIReport() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(
    async (
      result: AnalysisResult,
      apiKey: string,
      provider: 'claude' | 'gemini' | 'groq' = 'groq',
      model?: string
    ) => {
      setText('');
      setError(null);
      setLoading(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch('/api/ai-report', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-ai-key': apiKey,
            'x-ai-provider': provider,
            ...(model ? { 'x-ai-model': model } : {}),
          },
          body: JSON.stringify(result),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          throw new Error(body.error ?? 'AI report failed');
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const lines = decoder.decode(value).split('\n');
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6);
            try {
              const chunk = JSON.parse(raw) as string;
              if (chunk === '[DONE]') break;
              setText((prev) => prev + chunk);
            } catch {
              // ignore malformed chunks
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setText('');
    setError(null);
    setLoading(false);
  }, []);

  return { text, loading, error, start, reset };
}
