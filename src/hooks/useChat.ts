'use client';

import type { Provider } from '@/lib/ai/catalog';
import type { UsageData } from '@/lib/ai/provider';
import type { SnapshotRef } from '@/types';
import { useCallback, useRef, useState } from 'react';
import { readApiError } from '@/lib/api/response-error';

/**
 * La conversation, telle que le client la tient : rien que les tours visibles.
 *
 * Les tours d'outils n'y figurent pas. Le client ne les voit pas, et les lui faire porter
 * reviendrait à laisser un appelant fabriquer des résultats d'outil — la route les rejoue donc
 * à chaque requête depuis l'instantané, pas depuis ce que le navigateur affirme.
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

interface UsageEvent extends UsageData {
  _meta: 'usage';
}

/**
 * Tours envoyés au serveur. Le miroir de `MAX_MESSAGES` dans la route : dépasser fait refuser
 * la requête entière, et une conversation tronquée côté client vaut mieux qu'un 400.
 */
const MAX_SENT_MESSAGES = 24;

/**
 * Le chat d'une analyse.
 *
 * Même consommation SSE que `useAIReport` — tampon de ligne, `{ stream: true }`, sentinelle
 * `[DONE]`, trames `_meta: 'usage'`. Ce qui change est la destination du texte : il s'écrit
 * dans le dernier message de la liste au lieu d'un état à lui.
 *
 * `provider` voyage en en-tête, comme la clé et comme dans le rapport : le corps porte la
 * conversation, pas la façon de la servir. Il part toujours, clé personnelle ou non — sans lui
 * la route retomberait sur Claude, et l'utilisateur paierait un modèle qu'il n'a pas choisi.
 */
export function useChat(snapshot: SnapshotRef | undefined, apiKey: string, provider: Provider) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // L'historique envoyé est tronqué par la fin : un index de tableau désignerait un autre tour
  // après la première troncature, et React reutiliserait le nœud du précédent.
  const nextIdRef = useRef(0);
  const mintId = () => String((nextIdRef.current += 1));

  const send = useCallback(
    async (question: string) => {
      const asked = question.trim();
      if (!asked || loading) return;
      if (!snapshot) {
        setError('This analysis cannot be chatted about — run it again.');
        return;
      }

      setError(null);
      setUsage(null);
      setLoading(true);

      // L'historique envoyé s'arrête à la question : la réponse en cours n'en fait pas partie.
      const sent = [...messages, { id: mintId(), role: 'user' as const, text: asked }].slice(
        -MAX_SENT_MESSAGES
      );
      setMessages([...sent, { id: mintId(), role: 'assistant', text: '' }]);

      const appendToAnswer = (chunk: string) => {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, text: last.text + chunk };
          return next;
        });
      };

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-ai-provider': provider,
            ...(apiKey ? { 'x-ai-key': apiKey } : {}),
          },
          body: JSON.stringify({
            snapshot,
            messages: sent.map(({ role, text }) => ({ role, text })),
          }),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(await readApiError(res));

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        // Même raison que dans `useAIReport` : une trame SSE n'a aucune raison de tomber sur
        // une frontière de chunk, et la moitié perdue le serait en silence.
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
              appendToAnswer(chunk);
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

        buffer += decoder.decode();
        if (buffer) handleLine(buffer);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        // Une réponse restée vide — refus, coupure, abandon — est retirée. La route exige un
        // dernier tour utilisateur et refuse un message vide : la laisser rendrait la question
        // suivante impossible à envoyer, sur une conversation qui a pourtant l'air intacte.
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          return last?.role === 'assistant' && last.text === '' ? prev.slice(0, -1) : prev;
        });
        setLoading(false);
      }
    },
    [apiKey, loading, messages, provider, snapshot]
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setUsage(null);
    setError(null);
    setLoading(false);
  }, []);

  return { messages, usage, loading, error, send, reset };
}
