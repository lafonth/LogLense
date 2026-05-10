'use client';

import type { AnalysisInput, BossResult } from '@/types';
import { useCallback, useState } from 'react';

export type BossState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; result: BossResult | null }
  | { status: 'error'; message: string };

export function useAnalysis() {
  const [bossStates, setBossStates] = useState<BossState[]>([]);
  const [input, setInput] = useState<AnalysisInput | null>(null);

  const start = useCallback(async (analysisInput: AnalysisInput) => {
    setInput(analysisInput);
    const initial: BossState[] = analysisInput.encounters.map(() => ({ status: 'loading' }));
    setBossStates(initial);

    await Promise.all(
      analysisInput.encounters.map(async (enc, i) => {
        try {
          const res = await fetch(`/api/analyze/${enc.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              characterName: analysisInput.characterName,
              serverSlug: analysisInput.serverSlug,
              region: analysisInput.region,
              difficulty: analysisInput.difficulty,
              encounterName: enc.name,
            }),
          });

          if (!res.ok) {
            const body = (await res.json()) as { error?: string };
            setBossStates((prev) => {
              const next = [...prev];
              next[i] = { status: 'error', message: body.error ?? 'Request failed' };
              return next;
            });
            return;
          }

          const result = (await res.json()) as BossResult | null;
          setBossStates((prev) => {
            const next = [...prev];
            next[i] = { status: 'success', result };
            return next;
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Network error';
          setBossStates((prev) => {
            const next = [...prev];
            next[i] = { status: 'error', message };
            return next;
          });
        }
      })
    );
  }, []);

  const reset = useCallback(() => {
    setBossStates([]);
    setInput(null);
  }, []);

  const isAnyLoading = bossStates.some((s) => s.status === 'loading');
  const isDone = bossStates.length > 0 && !isAnyLoading;

  return { bossStates, isAnyLoading, isDone, input, start, reset };
}
