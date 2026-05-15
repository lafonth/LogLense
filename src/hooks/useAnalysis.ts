'use client';

import type { AnalysisInput, BossResult } from '@/types';
import { useCallback, useRef, useState } from 'react';

export type BossState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; result: BossResult | null }
  | { status: 'error'; message: string };

export function useAnalysis() {
  // Keyed by difficulty — survives difficulty switches within the same character
  const cacheRef = useRef<Partial<Record<number, BossState[]>>>({});
  const activeDiffRef = useRef<number | null>(null);
  const inputRef = useRef<AnalysisInput | null>(null);

  const [bossStates, setBossStates] = useState<BossState[]>([]);
  const [currentDifficulty, setCurrentDifficulty] = useState<number | null>(null);
  const [input, setInput] = useState<AnalysisInput | null>(null);

  const start = useCallback(async (analysisInput: AnalysisInput) => {
    const diff = analysisInput.difficulty;
    activeDiffRef.current = diff;
    setCurrentDifficulty(diff);

    // Bust cache when character or server changes
    const prev = inputRef.current;
    if (
      prev?.characterName !== analysisInput.characterName ||
      prev?.serverSlug !== analysisInput.serverSlug
    ) {
      cacheRef.current = {};
    }
    inputRef.current = analysisInput;
    setInput(analysisInput);

    // Cache hit — instant display
    if (cacheRef.current[diff]) {
      setBossStates([...cacheRef.current[diff]!]);
      return;
    }

    const initial: BossState[] = analysisInput.encounters.map(() => ({ status: 'loading' }));
    cacheRef.current[diff] = [...initial];
    setBossStates([...initial]);

    await Promise.all(
      analysisInput.encounters.map(async (enc, i) => {
        let state: BossState;
        try {
          const res = await fetch(`/api/analyze/${enc.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              characterName: analysisInput.characterName,
              serverSlug: analysisInput.serverSlug,
              region: analysisInput.region,
              difficulty: diff,
              encounterName: enc.name,
            }),
          });

          if (!res.ok) {
            const body = (await res.json()) as { error?: string };
            state = { status: 'error', message: body.error ?? 'Request failed' };
          } else {
            const result = (await res.json()) as BossResult | null;
            state = { status: 'success', result };
          }
        } catch (err) {
          state = {
            status: 'error',
            message: err instanceof Error ? err.message : 'Network error',
          };
        }

        const cached = cacheRef.current[diff];
        if (cached) {
          cached[i] = state;
          if (activeDiffRef.current === diff) {
            setBossStates([...cached]);
          }
        }
      })
    );
  }, []);

  const changeDifficulty = useCallback(
    (difficulty: AnalysisInput['difficulty']) => {
      if (!input) return;
      void start({ ...input, difficulty });
    },
    [input, start]
  );

  const reset = useCallback(() => {
    cacheRef.current = {};
    activeDiffRef.current = null;
    setBossStates([]);
    setCurrentDifficulty(null);
    setInput(null);
  }, []);

  const isAnyLoading = bossStates.some((s) => s.status === 'loading');
  const isDone = bossStates.length > 0 && !isAnyLoading;

  return {
    bossStates,
    currentDifficulty,
    isAnyLoading,
    isDone,
    input,
    start,
    changeDifficulty,
    reset,
  };
}
