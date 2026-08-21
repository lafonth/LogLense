'use client';

import type { AnalysisInput, BossResult } from '@/types';
import { useCallback, useRef, useState } from 'react';
import { readApiError } from '@/lib/api/response-error';

export type BossState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; result: BossResult | null }
  | { status: 'error'; message: string };

/** Ce qui distingue deux analyses d'un même boss : la spec demandée et la pull demandée. */
interface Variant {
  specIdOverride?: number;
  fightOverride?: { code: string; fightID: number };
}

function variantKey(difficulty: number, bossIdx: number, variant: Variant): string {
  const fight = variant.fightOverride
    ? `${variant.fightOverride.code}#${variant.fightOverride.fightID}`
    : 'best';
  return `${difficulty}:${bossIdx}:${variant.specIdOverride ?? 'base'}:${fight}`;
}

async function fetchBoss(
  input: AnalysisInput,
  encounter: { id: number; name: string },
  difficulty: number,
  variant: Variant,
  preferSnapshot: boolean
): Promise<BossState> {
  try {
    const res = await fetch(`/api/analyze/${encounter.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        characterName: input.characterName,
        serverSlug: input.serverSlug,
        region: input.region,
        difficulty,
        encounterName: encounter.name,
        specId: input.specId,
        ...variant,
        preferSnapshot,
      }),
    });

    if (!res.ok) return { status: 'error', message: await readApiError(res) };
    const result = (await res.json()) as BossResult | null;
    return { status: 'success', result };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Network error' };
  }
}

export function useAnalysis() {
  // Keyed by difficulty — survives difficulty switches within the same character
  const cacheRef = useRef<Partial<Record<number, BossState[]>>>({});
  // Keyed by difficulty:boss:spec:fight — revenir à une spec ou une pull déjà payée ne
  // relance pas les ~40 requêtes WCL de l'analyse. Seuls les succès y entrent : une erreur
  // réseau doit rester réessayable.
  const variantsRef = useRef(new Map<string, BossState>());
  const activeDiffRef = useRef<number | null>(null);
  const inputRef = useRef<AnalysisInput | null>(null);

  const [bossStates, setBossStates] = useState<BossState[]>([]);
  const [currentDifficulty, setCurrentDifficulty] = useState<number | null>(null);
  const [input, setInput] = useState<AnalysisInput | null>(null);

  /** Écrit l'état d'un boss dans le cache de sa difficulté, et à l'écran si elle est vue. */
  const commit = useCallback((difficulty: number, bossIdx: number, state: BossState) => {
    const cached = cacheRef.current[difficulty];
    if (!cached) return;
    cached[bossIdx] = state;
    if (activeDiffRef.current === difficulty) setBossStates([...cached]);
  }, []);

  const runBoss = useCallback(
    async (bossIdx: number, variant: Variant, preferSnapshot = false) => {
      const currentInput = inputRef.current;
      if (!currentInput) return;
      const enc = currentInput.encounters[bossIdx];
      if (!enc) return;

      const difficulty = currentInput.difficulty;
      const key = variantKey(difficulty, bossIdx, variant);

      const known = variantsRef.current.get(key);
      if (known) {
        commit(difficulty, bossIdx, known);
        return;
      }

      commit(difficulty, bossIdx, { status: 'loading' });
      const state = await fetchBoss(currentInput, enc, difficulty, variant, preferSnapshot);
      if (state.status === 'success') variantsRef.current.set(key, state);
      commit(difficulty, bossIdx, state);
    },
    [commit]
  );

  /**
   * `preferSnapshot` voyage en second argument plutôt que dans `AnalysisInput` : ce type est
   * du domaine, il ressort tel quel dans `AnalysisResult.input` et part au prompt. Une
   * préférence de cache n'y a rien à faire.
   *
   * Elle ne vaut que pour cette première salve. `switchBossSpec` et `switchBossFight` sont des
   * demandes neuves du lecteur : il a cliqué, il attend le calcul, pas le rendu d'un autre.
   */
  const start = useCallback(
    async (analysisInput: AnalysisInput, opts?: { preferSnapshot?: boolean }) => {
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
        variantsRef.current.clear();
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
        analysisInput.encounters.map((_, i) => runBoss(i, {}, opts?.preferSnapshot ?? false))
      );
    },
    [runBoss]
  );

  const changeDifficulty = useCallback(
    (difficulty: AnalysisInput['difficulty']) => {
      if (!input) return;
      void start({ ...input, difficulty });
    },
    [input, start]
  );

  const switchBossSpec = useCallback(
    async (bossIdx: number, specId: number) => {
      await runBoss(bossIdx, { specIdOverride: specId });
    },
    [runBoss]
  );

  const switchBossFight = useCallback(
    async (bossIdx: number, fight: { code: string; fightID: number }) => {
      await runBoss(bossIdx, { fightOverride: fight });
    },
    [runBoss]
  );

  const reset = useCallback(() => {
    cacheRef.current = {};
    variantsRef.current.clear();
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
    switchBossSpec,
    switchBossFight,
    reset,
  };
}
