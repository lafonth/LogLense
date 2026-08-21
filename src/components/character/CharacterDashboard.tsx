'use client';

import type { BossState } from '@/hooks/useAnalysis';
import type { AnalysisInput } from '@/types';
import { BossContentPanel } from '@/components/shared/BossContentPanel';
import { DashboardHeader, LoadingProgress } from '@/components/shared/DashboardHeader';
import { UserCharacterSwitcher } from './UserCharacterSwitcher';

interface CharacterDashboardProps {
  input: AnalysisInput;
  bossStates: BossState[];
  currentDifficulty: number;
  activeBossIdx: number;
  onDifficultyChange: (difficulty: AnalysisInput['difficulty']) => void;
  onBossChange: (idx: number) => void;
  onReset: () => void;
  onSwitchCharacter?: (name: string, realmSlug: string) => void;
  onSwitchBossSpec?: (bossIdx: number, specId: number) => void;
  onSwitchBossFight?: (bossIdx: number, fight: { code: string; fightID: number }) => void;
  onRetryBoss?: (bossIdx: number) => void;
}

function buildAnalysisResult(input: AnalysisInput, bossStates: BossState[]) {
  return {
    input,
    bosses: bossStates.map((s) => (s.status === 'success' ? s.result : null)),
    generatedAt: new Date().toISOString(),
  };
}

export function CharacterDashboard({
  input,
  bossStates,
  currentDifficulty,
  activeBossIdx,
  onDifficultyChange,
  onBossChange,
  onReset,
  onSwitchCharacter,
  onSwitchBossSpec,
  onSwitchBossFight,
  onRetryBoss,
}: CharacterDashboardProps) {
  const analysisResult = buildAnalysisResult(input, bossStates);

  return (
    <div className="flex h-full flex-col md:flex-row">
      {onSwitchCharacter && (
        <UserCharacterSwitcher
          region={input.region}
          currentCharacterName={input.characterName}
          currentRealmSlug={input.serverSlug}
          loading={bossStates.some((s) => s.status === 'loading' || s.status === 'idle')}
          onSelect={onSwitchCharacter}
        />
      )}
      <div className="min-w-0 flex-1 p-4 md:h-full md:min-h-0 md:overflow-y-auto md:px-8 md:py-6">
        <DashboardHeader
          title={input.characterName}
          subtitle={`${input.serverSlug} · ${input.region}`}
          difficulty={currentDifficulty}
          onDifficultyChange={onDifficultyChange}
          onReset={onReset}
        />
        <LoadingProgress encounters={input.encounters} bossStates={bossStates} />
        <BossContentPanel
          encounters={input.encounters}
          bossStates={bossStates}
          activeBossIdx={activeBossIdx}
          onBossChange={onBossChange}
          analysisResult={analysisResult}
          onSwitchBossSpec={onSwitchBossSpec}
          onSwitchBossFight={onSwitchBossFight}
          onRetryBoss={onRetryBoss}
        />
      </div>
    </div>
  );
}
