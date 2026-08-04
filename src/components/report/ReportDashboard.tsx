'use client';

import type { BossState } from '@/hooks/useAnalysis';
import type { AnalysisInput, AnalysisResult, ReportActor, ReportMeta } from '@/types';
import { useMemo } from 'react';
import { BossContentPanel } from '@/components/shared/BossContentPanel';
import { DashboardHeader, LoadingProgress } from '@/components/shared/DashboardHeader';
import { CharacterSwitcher } from './CharacterSwitcher';

interface ReportDashboardProps {
  meta: ReportMeta;
  actors: ReportActor[];
  selectedActorId: number;
  actorName: string;
  difficulty: number;
  activeBossIdx: number;
  result: AnalysisResult | null;
  loading: boolean;
  onSwitchActor: (actor: ReportActor) => void;
  onDifficultyChange: (diff: number) => void;
  onBossChange: (idx: number) => void;
  onReset: () => void;
}

export function ReportDashboard({
  meta,
  actors,
  selectedActorId,
  actorName,
  difficulty,
  activeBossIdx,
  result,
  loading,
  onSwitchActor,
  onDifficultyChange,
  onBossChange,
  onReset,
}: ReportDashboardProps) {
  const availableDifficulties = useMemo(() => {
    const set = new Set<number>();
    for (const f of meta.fights) {
      if (f.kill && f.encounterID > 0) set.add(f.difficulty);
    }
    return set;
  }, [meta.fights]);

  const encounters = useMemo(() => {
    const seen = new Set<number>();
    const list: { id: number; name: string }[] = [];
    for (const f of meta.fights) {
      if (f.kill && f.difficulty === difficulty && f.encounterID > 0 && !seen.has(f.encounterID)) {
        seen.add(f.encounterID);
        list.push({ id: f.encounterID, name: f.name });
      }
    }
    return list;
  }, [meta.fights, difficulty]);

  const resultIsStale = result !== null && result.input.characterName !== actorName;

  const bossStates: BossState[] = encounters.map((enc) => {
    if (loading || !result || resultIsStale) return { status: 'loading' };
    const bossResult = result.bosses.find((b) => b?.encounterId === enc.id) ?? null;
    return { status: 'success', result: bossResult };
  });

  const region = (result?.input.region ?? 'EU') as AnalysisInput['region'];

  const analysisInput: AnalysisInput = {
    characterName: actorName,
    serverSlug: '',
    region,
    difficulty: difficulty as AnalysisInput['difficulty'],
    encounters,
    specId: result?.input.specId ?? 103,
  };
  const analysisResult: AnalysisResult = {
    input: analysisInput,
    bosses: result?.bosses ?? [],
    generatedAt: result?.generatedAt ?? '',
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <CharacterSwitcher
        actors={actors}
        selectedActorId={selectedActorId}
        loading={loading}
        onSelect={onSwitchActor}
      />

      <div className="min-w-0 flex-1 p-4 md:px-8 md:py-6">
        <DashboardHeader
          title={actorName}
          subtitle={meta.title}
          difficulty={difficulty}
          availableDifficulties={availableDifficulties}
          onDifficultyChange={onDifficultyChange}
          onReset={onReset}
        />
        <LoadingProgress encounters={encounters} bossStates={bossStates} />
        <BossContentPanel
          encounters={encounters}
          bossStates={bossStates}
          activeBossIdx={activeBossIdx}
          onBossChange={onBossChange}
          analysisResult={analysisResult}
        />
      </div>
    </div>
  );
}
