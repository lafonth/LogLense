'use client';

import type { AnalysisInput } from '@/types';
import { CharacterForm } from '@/components/forms/CharacterForm';
import { ResultsDashboard } from '@/components/results/ResultsDashboard';
import { useAnalysis } from '@/hooks/useAnalysis';

export default function Home() {
  const { bossStates, isAnyLoading, isDone, input, start, reset } = useAnalysis();
  const showResults = isDone || isAnyLoading;

  async function handleSubmit(analysisInput: AnalysisInput) {
    await start(analysisInput);
  }

  if (showResults && input) {
    return <ResultsDashboard input={input} bossStates={bossStates} onReset={reset} />;
  }

  return <CharacterForm onSubmit={handleSubmit} loading={isAnyLoading} />;
}
