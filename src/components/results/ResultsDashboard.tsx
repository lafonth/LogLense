'use client';

import type { BossState } from '@/hooks/useAnalysis';
import type { AnalysisInput, AnalysisResult } from '@/types';
import { useState } from 'react';
import { AIReportTab } from '@/components/ai/AIReportTab';
import { BossSidebar } from './BossSidebar';
import { ComparisonTab } from './ComparisonTab';
import { OverviewTab } from './OverviewTab';

interface ResultsDashboardProps {
  input: AnalysisInput;
  bossStates: BossState[];
  onReset: () => void;
}

type TabId = 'overview' | 'comparison' | 'ai-report';

function buildAnalysisResult(input: AnalysisInput, bossStates: BossState[]): AnalysisResult {
  return {
    input,
    bosses: bossStates.map((s) => (s.status === 'success' ? s.result : null)),
    generatedAt: new Date().toISOString(),
  };
}

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

export function ResultsDashboard({ input, bossStates, onReset }: ResultsDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [activeBossIdx, setActiveBossIdx] = useState(0);

  const activeEnc = input.encounters[activeBossIdx];
  const activeBossState = bossStates[activeBossIdx] ?? { status: 'idle' as const };
  const analysisResult = buildAnalysisResult(input, bossStates);

  return (
    <div style={{ minHeight: '100vh', padding: '24px 32px' }}>
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
            {input.characterName}
          </h1>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
              color: 'var(--text-dim)',
            }}
          >
            {input.serverSlug} · {input.region} ·{' '}
            {input.difficulty === 5 ? 'Mythic' : input.difficulty === 4 ? 'Heroic' : 'Normal'}
          </span>
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

      <div style={{ display: 'flex', gap: '24px' }}>
        {activeTab !== 'ai-report' && (
          <BossSidebar
            encounters={input.encounters}
            bossStates={bossStates}
            activeIdx={activeBossIdx}
            onSelect={setActiveBossIdx}
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
  );
}
