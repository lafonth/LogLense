'use client';

import type { BossState } from '@/hooks/useAnalysis';
import type { AnalysisInput, AnalysisResult, ReportActor, ReportMeta } from '@/types';
import { useMemo, useState } from 'react';
import { AIReportTab } from '@/components/ai/AIReportTab';
import { BossSidebar } from '@/components/results/BossSidebar';
import { ComparisonTab } from '@/components/results/ComparisonTab';
import { OverviewTab } from '@/components/results/OverviewTab';
import { CharacterSwitcher } from './CharacterSwitcher';

type TabId = 'overview' | 'comparison' | 'ai-report';

const DIFFICULTIES = [
  { id: 5, label: 'Mythic' },
  { id: 4, label: 'Heroic' },
  { id: 3, label: 'Normal' },
] as const;

const tabButtonStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 20px',
  background: 'transparent',
  border: 'none',
  borderBottom: active ? '2px solid var(--gold)' : '2px solid transparent',
  color: active ? 'var(--gold)' : 'var(--text-dim)',
  fontFamily: 'var(--font-display)',
  fontSize: '1rem',
  cursor: 'pointer',
  letterSpacing: '0.04em',
});

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
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // Which difficulty IDs have at least one kill in this report
  const availableDifficulties = useMemo(() => {
    const set = new Set<number>();
    for (const f of meta.fights) {
      if (f.kill && f.encounterID > 0) set.add(f.difficulty);
    }
    return set;
  }, [meta.fights]);

  // Derive ordered unique encounters from meta (stable across loading states)
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

  // Build BossState for each encounter — loading until result arrives
  const bossStates: BossState[] = encounters.map((enc) => {
    if (loading || !result) return { status: 'loading' };
    const bossResult = result.bosses.find((b) => b?.encounterId === enc.id) ?? null;
    return { status: 'success', result: bossResult };
  });

  const safeIdx = Math.min(activeBossIdx, Math.max(0, encounters.length - 1));
  const activeEnc = encounters[safeIdx];
  const activeBossState: BossState = bossStates[safeIdx] ?? { status: 'loading' };

  // Minimal AnalysisInput shape for AIReportTab
  const analysisInput: AnalysisInput = {
    characterName: actorName,
    serverSlug: '',
    region: 'EU',
    difficulty: difficulty as AnalysisInput['difficulty'],
    encounters,
  };
  const analysisResult: AnalysisResult = {
    input: analysisInput,
    bosses: result?.bosses ?? [],
    generatedAt: result?.generatedAt ?? '',
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Left: character switcher */}
      <CharacterSwitcher
        actors={actors}
        selectedActorId={selectedActorId}
        loading={loading}
        onSelect={onSwitchActor}
      />

      {/* Right: main content */}
      <div style={{ flex: 1, minWidth: 0, padding: '24px 32px' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: '24px',
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
              {actorName}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.78rem',
                  color: 'var(--text-dim)',
                }}
              >
                {meta.title}
              </span>
              <span style={{ color: 'var(--border)' }}>·</span>
              {DIFFICULTIES.map(({ id, label }) => {
                const available = availableDifficulties.has(id);
                const active = difficulty === id;
                return available ? (
                  <button
                    key={id}
                    onClick={() => !active && onDifficultyChange(id)}
                    style={{
                      padding: '2px 10px',
                      borderRadius: '999px',
                      border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
                      background: active ? 'rgba(198,168,74,0.12)' : 'transparent',
                      color: active ? 'var(--gold)' : 'var(--text-dim)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.72rem',
                      letterSpacing: '0.04em',
                      cursor: active ? 'default' : 'pointer',
                    }}
                  >
                    {label}
                  </button>
                ) : (
                  <span
                    key={id}
                    title="No kills at this difficulty"
                    style={{
                      padding: '2px 10px',
                      borderRadius: '999px',
                      border: '1px solid var(--border)',
                      color: 'var(--text-dim)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.72rem',
                      letterSpacing: '0.04em',
                      opacity: 0.3,
                    }}
                  >
                    {label}
                  </span>
                );
              })}
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

        {/* Tab bar */}
        <div style={{ borderBottom: '1px solid var(--border)', marginBottom: '24px' }}>
          {(['overview', 'comparison', 'ai-report'] as TabId[]).map((tab) => (
            <button
              key={tab}
              style={tabButtonStyle(activeTab === tab)}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'overview' ? 'Overview' : tab === 'comparison' ? 'Comparison' : 'AI Report'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ display: 'flex', gap: '24px' }}>
          {activeTab !== 'ai-report' && encounters.length > 0 && (
            <BossSidebar
              encounters={encounters}
              bossStates={bossStates}
              activeIdx={safeIdx}
              onSelect={onBossChange}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            {activeTab === 'overview' && activeEnc && (
              <OverviewTab encounter={activeEnc} bossState={activeBossState} />
            )}
            {activeTab === 'comparison' && activeEnc && (
              <ComparisonTab encounter={activeEnc} bossState={activeBossState} />
            )}
            {activeTab === 'ai-report' && <AIReportTab analysisResult={analysisResult} />}
          </div>
        </div>
      </div>
    </div>
  );
}
