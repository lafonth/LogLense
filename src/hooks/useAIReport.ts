'use client';

import type { UsageData } from '@/lib/ai/provider';
import type { AnalysisResult } from '@/types';
import { useCallback, useRef, useState } from 'react';
import { readApiError } from '@/lib/api/response-error';

interface UsageEvent extends UsageData {
  _meta: 'usage';
}

export function useAIReport() {
  const [text, setText] = useState('');
  const [usage, setUsage] = useState<UsageData | null>(null);
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
      setUsage(null);
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

        if (!res.ok) throw new Error(await readApiError(res));

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
              const chunk = JSON.parse(raw) as string | UsageEvent;
              if (chunk === '[DONE]') break;
              if (typeof chunk === 'object' && chunk._meta === 'usage') {
                const { _meta: _, ...data } = chunk;
                setUsage(data as UsageData);
              } else if (typeof chunk === 'string') {
                setText((prev) => prev + chunk);
              }
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
    setUsage(null);
    setError(null);
    setLoading(false);
  }, []);

  return { text, usage, loading, error, start, reset };
}
