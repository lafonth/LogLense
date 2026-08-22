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
        /*
         * Une trame SSE n'a aucune raison de tomber sur une frontière de chunk. Sans tampon,
         * la moitié d'un `data:` partait au `JSON.parse` du tour courant, l'autre moitié au
         * suivant : deux échecs avalés par le `catch` ci-dessous, et du texte perdu sans
         * qu'aucune erreur ne le dise. `{ stream: true }` traite le même problème un cran
         * plus bas, sur les caractères multi-octets coupés en deux. Même construction que
         * `gemini.ts` et `groq.ts`.
         */
        let buffer = '';

        const handleLine = (line: string) => {
          if (!line.startsWith('data: ')) return;
          const raw = line.slice(6).trim();
          if (!raw || raw === '[DONE]') return;
          try {
            const chunk = JSON.parse(raw) as string | UsageEvent;
            if (chunk === '[DONE]') return;
            if (typeof chunk === 'object' && chunk._meta === 'usage') {
              const { _meta: _, ...data } = chunk;
              setUsage(data as UsageData);
            } else if (typeof chunk === 'string') {
              setText((prev) => prev + chunk);
            }
          } catch {
            // ignore malformed chunks
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) handleLine(line);
        }

        // La dernière trame peut arriver sans saut de ligne final : elle est encore au tampon.
        buffer += decoder.decode();
        if (buffer) handleLine(buffer);
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
