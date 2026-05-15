'use client';

import type { StepStatus } from '@/components/ui/ProgressSteps';
import type { BossState } from '@/hooks/useAnalysis';
import type { AnalysisInput } from '@/types';
import { BossContentPanel } from '@/components/shared/BossContentPanel';
import { ProgressSteps } from '@/components/ui/ProgressSteps';
import { UserCharacterSwitcher } from './UserCharacterSwitcher';

const DIFFICULTIES = [
  { id: 5, label: 'Mythic' },
  { id: 4, label: 'Heroic' },
  { id: 3, label: 'Normal' },
] as const;

interface CharacterDashboardProps {
  input: AnalysisInput;
  bossStates: BossState[];
  currentDifficulty: number;
  activeBossIdx: number;
  onDifficultyChange: (difficulty: AnalysisInput['difficulty']) => void;
  onBossChange: (idx: number) => void;
  onReset: () => void;
  onSwitchCharacter?: (name: string, realmSlug: string) => void;
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
}: CharacterDashboardProps) {
  const isLoading = bossStates.some((s) => s.status === 'loading' || s.status === 'idle');
  const analysisResult = buildAnalysisResult(input, bossStates);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {onSwitchCharacter && (
        <UserCharacterSwitcher
          region={input.region}
          currentCharacterName={input.characterName}
          currentRealmSlug={input.serverSlug}
          loading={isLoading}
          onSelect={onSwitchCharacter}
        />
      )}
      <div style={{ flex: 1, minWidth: 0, padding: '24px 32px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: '24px',
          paddingRight: '170px',
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.8rem',
              color: 'var(--gold)',
              margin: 0,
            }}
          >
            {input.characterName}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.78rem',
                color: 'var(--text-dim)',
              }}
            >
              {input.serverSlug} · {input.region}
            </span>
            <span style={{ color: 'var(--border)' }}>·</span>
            {DIFFICULTIES.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => onDifficultyChange(id)}
                style={{
                  padding: '2px 10px',
                  borderRadius: '999px',
                  border: `1px solid ${currentDifficulty === id ? 'var(--gold)' : 'var(--border)'}`,
                  background: currentDifficulty === id ? 'rgba(198,168,74,0.12)' : 'transparent',
                  color: currentDifficulty === id ? 'var(--gold)' : 'var(--text-dim)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                  letterSpacing: '0.04em',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={onReset}
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8rem',
            padding: '6px 14px',
            cursor: 'pointer',
          }}
        >
          ← New search
        </button>
      </div>

      {isLoading && (
        <div
          style={{
            marginBottom: '20px',
            padding: '14px 16px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              color: 'var(--gold-dim)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '10px',
            }}
          >
            Fetching bosses…
          </div>
          <ProgressSteps
            steps={input.encounters.map((enc, i) => {
              const s = bossStates[i];
              const status: StepStatus =
                s?.status === 'success'
                  ? 'done'
                  : s?.status === 'error'
                    ? 'error'
                    : s?.status === 'loading'
                      ? 'loading'
                      : 'pending';
              return { label: enc.name, status };
            })}
          />
        </div>
      )}

      <BossContentPanel
        encounters={input.encounters}
        bossStates={bossStates}
        activeBossIdx={activeBossIdx}
        onBossChange={onBossChange}
        analysisResult={analysisResult}
      />
      </div>
    </div>
  );
}
