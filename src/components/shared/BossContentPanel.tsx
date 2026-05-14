'use client';

import type { BossState } from '@/hooks/useAnalysis';
import type { AnalysisResult } from '@/types';
import { useState } from 'react';
import { AIReportTab } from '@/components/ai/AIReportTab';
import { BossSidebar } from '@/components/results/BossSidebar';
import { ComparisonTab } from '@/components/results/ComparisonTab';
import { OverviewTab } from '@/components/results/OverviewTab';

type TabId = 'overview' | 'comparison' | 'ai-report';

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

interface BossContentPanelProps {
  encounters: { id: number; name: string }[];
  bossStates: BossState[];
  activeBossIdx: number;
  onBossChange: (idx: number) => void;
  analysisResult: AnalysisResult;
}

export function BossContentPanel({
  encounters,
  bossStates,
  activeBossIdx,
  onBossChange,
  analysisResult,
}: BossContentPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const safeIdx = Math.min(activeBossIdx, Math.max(0, encounters.length - 1));
  const activeEnc = encounters[safeIdx];
  const activeBossState: BossState = bossStates[safeIdx] ?? { status: 'loading' };

  return (
    <>
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
    </>
  );
}
