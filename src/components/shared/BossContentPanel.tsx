'use client';

import type { BossState } from '@/hooks/useAnalysis';
import type { EncounterKill } from '@/lib/report-kills';
import type { AnalysisInput, BossResult, TalentNode } from '@/types';
import { useEffect, useState } from 'react';
import { AIReportTab } from '@/components/ai/AIReportTab';
import { BossSidebar } from '@/components/results/BossSidebar';
import { ComparisonTab } from '@/components/results/ComparisonTab';
import { OverviewTab } from '@/components/results/OverviewTab';
import { VerdictBanner } from '@/components/results/VerdictBanner';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { tabId, tabPanelId } from '@/components/ui/tab-ids';
import { Tabs } from '@/components/ui/Tabs';
import { getDpsSpecsForClass, getSpecInfo } from '@/lib/specs';
import { fmtMs } from '@/lib/wcl/parsers';

function fightKey(fight: { code: string; fightID: number }): string {
  return `${fight.code}#${fight.fightID}`;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

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
  onSwitchBossFight?: (bossIdx: number, fight: { code: string; fightID: number }) => void;
  /** Chemin rapport : les kills du rapport ouvert, par rencontre. */
  pulls?: Record<number, EncounterKill[]>;
  /** Chemin rapport : la pull retenue par rencontre. Absente = le dernier kill. */
  selectedPull?: Record<number, number>;
  onSelectPull?: (encounterId: number, fightId: number) => void;
}

export function BossContentPanel({
  encounters,
  bossStates,
  activeBossIdx,
  onBossChange,
  analysisResult,
  onSwitchBossSpec,
  onSwitchBossFight,
  pulls,
  selectedPull,
  onSelectPull,
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

  // Les kills du boss affiché, la plus récente en tête — c'est celle qui est analysée par
  // défaut, donc celle que le lecteur s'attend à lire en haut de la liste.
  const activePulls = (activeEnc ? pulls?.[activeEnc.id] : undefined) ?? [];
  const pullOptions = activePulls
    .map((kill, i) => ({
      ...kill,
      label: `Kill ${i + 1} of ${activePulls.length} · ${fmtMs(kill.fightMs)}`,
    }))
    .reverse();
  const currentPullId =
    (activeEnc ? selectedPull?.[activeEnc.id] : undefined) ??
    activePulls[activePulls.length - 1]?.fightId;

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
      {/* Au-dessus des onglets, donc sur les deux chemins d'analyse : le lecteur n'a pas à
          choisir un onglet pour savoir s'il a quelque chose à apprendre. */}
      {activeBossResult && (
        <div className="mb-6">
          <VerdictBanner result={activeBossResult} />
        </div>
      )}

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
                  aria-current={spec.specId === currentSpecId ? true : undefined}
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

          {/* Fight picker — character mode only, lets the user override which kill is analysed
              instead of always taking the all-time-highest parse. Sorted by dps, not date: the
              user is choosing a log to inspect, not browsing a timeline. */}
          {onSwitchBossFight &&
            activeBossResult &&
            activeBossResult.character.trajectory.length > 1 && (
              <div className="mb-4 max-w-xs">
                <Select
                  label="Fight"
                  disabled={activeBossState.status === 'loading'}
                  value={fightKey(activeBossResult.character.source)}
                  onChange={(e) => {
                    const point = activeBossResult.character.trajectory.find(
                      (p) => fightKey(p) === e.target.value
                    );
                    if (point)
                      onSwitchBossFight(safeIdx, { code: point.code, fightID: point.fightID });
                  }}
                >
                  {[...activeBossResult.character.trajectory]
                    .sort((a, b) => b.dps - a.dps)
                    .map((point) => (
                      <option key={fightKey(point)} value={fightKey(point)}>
                        {point.dps.toLocaleString('en-US')} dps · {shortDate(point.at)}
                        {point.bracket ? ` · ${point.bracket} ilvl` : ''}
                      </option>
                    ))}
                </Select>
              </div>
            )}

          {/* Pull picker — report mode only. Le dernier kill de la soirée est souvent le farm
              de fin, pas la pull qui mérite d'être lue. Aucun dps n'est connu avant analyse :
              les pulls se distinguent par leur rang et leur durée, pas par leur résultat. */}
          {onSelectPull && activeEnc && pullOptions.length > 1 && (
            <div className="mb-4 max-w-xs">
              <Select
                label="Pull"
                disabled={activeBossState.status === 'loading'}
                value={String(currentPullId)}
                onChange={(e) => onSelectPull(activeEnc.id, Number(e.target.value))}
              >
                {pullOptions.map((pull) => (
                  <option key={pull.fightId} value={pull.fightId}>
                    {pull.label}
                  </option>
                ))}
              </Select>
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
