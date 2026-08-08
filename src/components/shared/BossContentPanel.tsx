'use client';

import type { BossState } from '@/hooks/useAnalysis';
import type { AnalysisInput, BossResult, TalentNode } from '@/types';
import { useEffect, useState } from 'react';
import { AIReportTab } from '@/components/ai/AIReportTab';
import { BossSidebar } from '@/components/results/BossSidebar';
import { ComparisonTab } from '@/components/results/ComparisonTab';
import { OverviewTab } from '@/components/results/OverviewTab';
import { Button } from '@/components/ui/Button';
import { tabId, tabPanelId } from '@/components/ui/tab-ids';
import { Tabs } from '@/components/ui/Tabs';
import { getDpsSpecsForClass, getSpecInfo } from '@/lib/specs';

type TabId = 'overview' | 'comparison' | 'ai-report';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'comparison', label: 'Comparison' },
  { id: 'ai-report', label: 'AI Report' },
];

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
      <div className="mb-6">
        <Tabs tabs={TABS} active={activeTab} onChange={(id) => setActiveTab(id as TabId)} />
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        {activeTab !== 'ai-report' && encounters.length > 0 && (
          <BossSidebar
            encounters={encounters}
            bossStates={bossStates}
            activeIdx={safeIdx}
            onSelect={onBossChange}
          />
        )}
        <div
          id={tabPanelId(activeTab)}
          role="tabpanel"
          aria-labelledby={tabId(activeTab)}
          tabIndex={0}
          className="focus-visible:outline-brass-bright min-w-0 flex-1 focus-visible:outline-2"
        >
          {/* Spec switcher — character mode only, shown once spec is known */}
          {onSwitchBossSpec && availableSpecs.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {availableSpecs.map((spec) => (
                <Button
                  key={spec.specId}
                  variant="secondary"
                  size="sm"
                  disabled={activeBossState.status === 'loading'}
                  className={
                    spec.specId === currentSpecId ? 'bg-surface border-brass text-brass' : ''
                  }
                  onClick={() => {
                    if (spec.specId !== currentSpecId) {
                      setBossSpecIds((prev) => ({ ...prev, [safeIdx]: spec.specId }));
                      onSwitchBossSpec(safeIdx, spec.specId);
                    }
                  }}
                >
                  {spec.specName}
                </Button>
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
