'use client';

import type { BossState } from '@/hooks/useAnalysis';
import type { EncounterKill } from '@/lib/report-kills';
import type { TabId } from '@/lib/routes';
import type { AnalysisInput, BossOutcome, TalentNode } from '@/types';
import { useEffect, useState } from 'react';
import { AIReportTab } from '@/components/ai/AIReportTab';
import { ChatTab } from '@/components/ai/ChatTab';
import { BossSidebar } from '@/components/results/BossSidebar';
import { ComparabilityBanner } from '@/components/results/ComparabilityBanner';
import { ComparisonTab } from '@/components/results/ComparisonTab';
import { DpsBanner } from '@/components/results/DpsBanner';
import { OverviewTab } from '@/components/results/OverviewTab';
import { ShareCard } from '@/components/results/ShareCard';
import { VerdictBanner } from '@/components/results/VerdictBanner';
import { Button } from '@/components/ui/Button';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { Select } from '@/components/ui/Select';
import { tabId, tabPanelId } from '@/components/ui/tab-ids';
import { Tabs } from '@/components/ui/Tabs';
import { isBossRefusal, isBossResult } from '@/lib/boss-outcome';
import { buildShareCard } from '@/lib/comparison/share-card';
import { buildVerdict, verdictNamesIlvl } from '@/lib/comparison/verdict';
import { getDpsSpecsForClass, getSpecInfo } from '@/lib/specs';
import { fightUrl } from '@/lib/wcl/fight-url';
import { fmtMs } from '@/lib/wcl/parsers';

function fightKey(fight: { code: string; fightID: number }): string {
  return `${fight.code}#${fight.fightID}`;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'comparison', label: 'Comparison' },
  { id: 'ai-report', label: 'AI Report' },
  { id: 'chat', label: 'Chat' },
];

interface BossContentPanelProps {
  encounters: { id: number; name: string }[];
  bossStates: BossState[];
  activeBossIdx: number;
  onBossChange: (idx: number) => void;
  /**
   * L'onglet ouvert vient de l'URL, pas d'un état local : un lien qui montre un écart doit
   * ouvrir sur l'onglet qui le montre. Le panneau affiche, il ne retient plus.
   */
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  analysisResult: { input: AnalysisInput; bosses: (BossOutcome | null)[]; generatedAt: string };
  onSwitchBossSpec?: (bossIdx: number, specId: number) => void;
  onSwitchBossFight?: (bossIdx: number, fight: { code: string; fightID: number }) => void;
  /** Relance le boss affiché quand il a échoué. Absent = pas de reprise offerte. */
  onRetryBoss?: (bossIdx: number) => void;
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
  activeTab,
  onTabChange,
  analysisResult,
  onSwitchBossSpec,
  onSwitchBossFight,
  onRetryBoss,
  pulls,
  selectedPull,
  onSelectPull,
}: BossContentPanelProps) {
  const [talentNodes, setTalentNodes] = useState<TalentNode[]>([]);

  // La carte de partage est repliée par défaut : elle ne dit rien de plus que le verdict à
  // qui lit son propre résultat, et tout à qui reçoit l'image. C'est un objet à sortir, pas
  // une bande de plus au-dessus des onglets.
  const [shareOpen, setShareOpen] = useState(false);

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
  const activeOutcome = activeBossState.status === 'success' ? activeBossState.result : null;
  // Le refus se lit à part, jamais comme un résultat amputé : tout ce qui suit — verdict,
  // carte de partage, onglets — exige un résultat, et n'en aura pas.
  const activeBossResult = isBossResult(activeOutcome) ? activeOutcome : null;
  const activeRefusal = isBossRefusal(activeOutcome) ? activeOutcome : null;
  // Un seul `buildVerdict` pour le bloc entier : trois consommateurs le lisaient, chacun le
  // recalculait, et rien ne garantissait qu'ils parlent du même.
  const verdict = activeBossResult ? buildVerdict(activeBossResult) : null;
  const shareCard = activeBossResult ? buildShareCard(activeBossResult) : null;

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
      {/* Devant tout le reste, bandeau de verdict compris : quand nous refusons de
          comparer, c'est la première chose à lire, et la seule qui explique pourquoi les
          onglets sont vides. Le rouge est réservé aux erreurs — sauf ici : signaler une
          comparaison illégitime est l'autre chose qu'il a le droit de dire. */}
      {activeRefusal && (
        <div
          role="status"
          className="border-danger bg-danger/10 text-danger mb-6 rounded-sm border px-4 py-3 font-mono text-xs"
        >
          <span className="font-semibold">
            {activeRefusal.specLabel ?? `Spec ${activeRefusal.specId}`}
          </span>{' '}
          — not compared. LogLense measures damage output, and the log shows a spec it does not
          rank. Nothing here was compared to anyone.
        </div>
      )}

      {/* Au-dessus des onglets, donc sur les deux chemins d'analyse : le lecteur n'a pas à
          choisir un onglet pour savoir s'il a quelque chose à apprendre. */}
      {activeBossResult && verdict && (
        <div className="mb-6">
          {/* En tête de tout, et hors des onglets. C'est la seule position que nous tenons
              pour défendable : nous refusons de comparer quand la comparaison n'est pas
              légitime, et nous le disons avant de dire quoi que ce soit d'autre. Rangé dans
              l'onglet Comparison, l'aveu ne se lisait qu'après un clic — et un visiteur qui
              ne le voit pas nous lit comme un Warcraft Logs de plus. */}
          <div className="mb-3">
            <ComparabilityBanner
              comparability={activeBossResult.comparability}
              earlyDeathPct={verdict.earlyDeathPct}
            />
          </div>
          <VerdictBanner result={activeBossResult} />
          {/* Monté ici plutôt que dans chaque onglet : le même DPS s'y lisait une fois par
              onglet, en plus du verdict qui l'énonce déjà. Ce qui reste — le percentile, la
              durée du kill, l'ilvl, le DPS sur le boss seul — vaut pour tous les onglets,
              `ai-report` compris.

              L'ilvl fait exception : le verdict juste au-dessus le cite dès qu'il a de quoi
              le faire, et le chiffre s'affichait alors deux fois dans le même bloc. On ne le
              passe donc que lorsque le verdict se tait — sinon il ne se lirait plus nulle
              part, et c'est un critère de comparabilité, pas un ornement. La condition n'est
              pas recopiée ici : `verdictNamesIlvl` la porte, à côté du verdict. */}
          <DpsBanner
            dps={activeBossResult.character.dps}
            overallPct={activeBossResult.character.overallPct}
            ilvl={verdictNamesIlvl(verdict) ? null : activeBossResult.character.stats.avgIlvl}
            killTime={activeBossResult.character.killTime}
            bossDps={activeBossResult.character.bossDps}
            bossDpsPct={activeBossResult.character.bossDpsPct}
          />
          {/* `null` quand le panel ne porte pas d'écart chiffrable : le déclencheur disparaît
              avec la carte, plutôt que d'ouvrir sur un vide. */}
          {shareCard && (
            <div className="mt-4">
              <Button
                variant="secondary"
                size="sm"
                className="font-mono text-xs"
                aria-expanded={shareOpen}
                onClick={() => setShareOpen((open) => !open)}
              >
                {shareOpen ? 'Hide share card' : 'Share card'}
              </Button>
              {shareOpen && (
                <div className="mt-3 max-w-xl">
                  <ShareCard card={shareCard} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mb-6">
        <Tabs tabs={TABS} active={activeTab} onChange={(id) => onTabChange(id as TabId)} />
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        {activeTab !== 'ai-report' && activeTab !== 'chat' && encounters.length > 0 && (
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

          {/* La source. Ce que LogLense ne rend pas — la timeline, les buffs, les autres
              joueurs — n'existe que sur le log lui-même. Posé sous les sélecteurs plutôt que
              dedans : il suit le combat analysé, y compris quand aucun sélecteur ne s'affiche
              parce qu'il n'y a qu'une pull. */}
          {activeBossResult && (
            <div className="mb-4">
              <ExternalLink
                href={fightUrl(
                  activeBossResult.character.source.code,
                  activeBossResult.character.source.fightID,
                  activeBossResult.character.source.actorId
                )}
              >
                View this fight on Warcraft Logs
              </ExternalLink>
            </div>
          )}

          {activeTab === 'overview' && activeEnc && (
            <OverviewTab
              encounter={activeEnc}
              bossState={activeBossState}
              specName={specName}
              onRetry={onRetryBoss && (() => onRetryBoss(safeIdx))}
            />
          )}
          {activeTab === 'comparison' && activeEnc && (
            <ComparisonTab
              encounter={activeEnc}
              bossState={activeBossState}
              specName={specName}
              talentNodes={talentNodes}
              onRetry={onRetryBoss && (() => onRetryBoss(safeIdx))}
            />
          )}
          {/*
            Remonté sur le `renderId` du boss : le chat n'a pas d'état serveur, donc changer de
            boss sans jeter la conversation la ferait poser des questions sur un instantané et
            en montrer les réponses sous un autre.
          */}
          {activeTab === 'chat' && (
            <ChatTab key={activeBossResult?.renderId ?? 'none'} boss={activeBossResult} />
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
