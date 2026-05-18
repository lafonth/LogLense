'use client';

import type { BossState } from '@/hooks/useAnalysis';
import type { AnalysisInput, BossResult, TalentNode } from '@/types';
import { useEffect, useState } from 'react';
import { AIReportTab } from '@/components/ai/AIReportTab';
import { BossSidebar } from '@/components/results/BossSidebar';
import { ComparisonTab } from '@/components/results/ComparisonTab';
import { OverviewTab } from '@/components/results/OverviewTab';
import { getDpsSpecsForClass, getSpecInfo } from '@/lib/specs';

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
  analysisResult: { input: AnalysisInput; bosses: (BossResult | null)[]; generatedAt: string };
  onSwitchBossSpec?: (bossIdx: number, specId: number) => void;
}

export function BossContentPanel({
  encounters,
  bossStates,
  activeBossIdx,
  onBossChange,
  analysisResult,
  onSwitchBossSpec,
}: BossContentPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [talentNodes, setTalentNodes] = useState<TalentNode[]>([]);

  // Track selected specId per boss so switcher stays visible during re-analysis loading
  const [bossSpecIds, setBossSpecIds] = useState<Record<number, number>>({});

  useEffect(() => {
    bossStates.forEach((state, idx) => {
      if (state.status === 'success' && state.result?.specId) {
        setBossSpecIds((prev) => {
          if (prev[idx] === state.result!.specId) return prev;
          return { ...prev, [idx]: state.result!.specId };
        });
      }
    });
  }, [bossStates]);

  const safeIdx = Math.min(activeBossIdx, Math.max(0, encounters.length - 1));
  const activeEnc = encounters[safeIdx];
  const activeBossState: BossState = bossStates[safeIdx] ?? { status: 'loading' };
  const activeBossResult = activeBossState.status === 'success' ? activeBossState.result : null;

  const currentSpecId = bossSpecIds[safeIdx];
  const currentSpecInfo = currentSpecId ? getSpecInfo(currentSpecId) : null;
  const specName = currentSpecInfo
    ? `${currentSpecInfo.specName} ${currentSpecInfo.className}`
    : 'Unknown';
  const availableSpecs = currentSpecInfo ? getDpsSpecsForClass(currentSpecInfo.wowClass) : [];

  useEffect(() => {
    if (!currentSpecId) return;
    void import(`@/data/talents/spec-${currentSpecId}.json`)
      .then((mod) => setTalentNodes((mod.default ?? mod) as TalentNode[]))
      .catch(() => setTalentNodes([]));
  }, [currentSpecId]);

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
          {/* Spec switcher — character mode only, shown once spec is known */}
          {onSwitchBossSpec && availableSpecs.length > 1 && (
            <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {availableSpecs.map((spec) => (
                <button
                  key={spec.specId}
                  disabled={activeBossState.status === 'loading'}
                  onClick={() => {
                    if (spec.specId !== currentSpecId) {
                      setBossSpecIds((prev) => ({ ...prev, [safeIdx]: spec.specId }));
                      onSwitchBossSpec(safeIdx, spec.specId);
                    }
                  }}
                  style={{
                    padding: '4px 12px',
                    background: spec.specId === currentSpecId ? 'var(--surface)' : 'transparent',
                    border: `1px solid ${spec.specId === currentSpecId ? 'var(--gold-dim)' : 'var(--border)'}`,
                    borderRadius: '4px',
                    color: spec.specId === currentSpecId ? 'var(--gold)' : 'var(--text-dim)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.75rem',
                    cursor:
                      activeBossState.status === 'loading' || spec.specId === currentSpecId
                        ? 'default'
                        : 'pointer',
                    opacity: activeBossState.status === 'loading' ? 0.5 : 1,
                  }}
                >
                  {spec.specName}
                </button>
              ))}
            </div>
          )}

          {activeTab === 'overview' && activeEnc && (
            <OverviewTab encounter={activeEnc} bossState={activeBossState} specName={specName} />
          )}
          {activeTab === 'comparison' && activeEnc && (
            <ComparisonTab
              encounter={activeEnc}
              bossState={activeBossState}
              specName={specName}
              talentNodes={talentNodes}
            />
          )}
          {activeTab === 'ai-report' && (
            <AIReportTab
              bossStates={bossStates}
              input={analysisResult.input}
              activeBossResult={activeBossResult}
            />
          )}
        </div>
      </div>
    </>
  );
}
