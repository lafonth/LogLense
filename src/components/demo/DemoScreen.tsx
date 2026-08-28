'use client';

import type { BossState } from '@/hooks/useAnalysis';
import type { TalentNode } from '@/types';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ComparabilityBanner } from '@/components/results/ComparabilityBanner';
import { ComparisonTab } from '@/components/results/ComparisonTab';
import { DpsBanner } from '@/components/results/DpsBanner';
import { OverviewTab } from '@/components/results/OverviewTab';
import { ShareCard } from '@/components/results/ShareCard';
import { VerdictBanner } from '@/components/results/VerdictBanner';
import { Button } from '@/components/ui/Button';
import { tabId, tabPanelId } from '@/components/ui/tab-ids';
import { Tabs } from '@/components/ui/Tabs';
import { buildShareCard } from '@/lib/comparison/share-card';
import { buildVerdict, verdictNamesIlvl } from '@/lib/comparison/verdict';
import { DEMO_BOSS_RESULT, DEMO_CAPTURED_AT } from '@/lib/demo/boss-result';
import { HOME_PATH } from '@/lib/routes';
import { getSpecInfo } from '@/lib/specs';

/**
 * Les quatre onglets du produit, pas les deux qui marchent ici.
 *
 * N'en montrer que deux laisserait croire que l'outil en a deux. Les deux derniers
 * s'ouvrent et disent en une ligne ce qui leur manque : ils appellent un modèle en direct,
 * et le chat exige une session même avec une clé personnelle — position produit, pas limite
 * de cette page.
 */
const DEMO_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'comparison', label: 'Comparison' },
  { id: 'ai-report', label: 'AI Report' },
  { id: 'chat', label: 'Chat' },
] as const;

type DemoTabId = (typeof DEMO_TABS)[number]['id'];

const ENCOUNTER = { id: DEMO_BOSS_RESULT.encounterId, name: DEMO_BOSS_RESULT.encounter };

const BOSS_STATE: BossState = { status: 'success', result: DEMO_BOSS_RESULT };

const LOCKED: Record<string, string> = {
  'ai-report': 'The AI report reads this comparison and writes what to change first.',
  chat: 'The chat replays the reference bench under other filters, and answers on the numbers.',
};

export function DemoScreen() {
  const [tab, setTab] = useState<DemoTabId>('overview');
  const [shareOpen, setShareOpen] = useState(false);
  const [talentNodes, setTalentNodes] = useState<TalentNode[]>([]);

  const specInfo = getSpecInfo(DEMO_BOSS_RESULT.specId);
  const specName = specInfo ? `${specInfo.specName} ${specInfo.className}` : 'Unknown';

  useEffect(() => {
    void import(`@/data/talents/spec-${DEMO_BOSS_RESULT.specId}.json`)
      .then((mod) => setTalentNodes((mod.default ?? mod) as TalentNode[]))
      .catch(() => setTalentNodes([]));
  }, []);

  const verdict = buildVerdict(DEMO_BOSS_RESULT);
  const shareCard = buildShareCard(DEMO_BOSS_RESULT);
  const locked = LOCKED[tab];

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-8 md:px-8">
      <header className="border-border mb-8 border-b pb-6">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-display text-brass text-2xl tracking-wide">
            {DEMO_BOSS_RESULT.encounter}
          </h1>
          <span className="text-muted font-mono text-xs">
            {specName} · Mythic · frozen {DEMO_CAPTURED_AT}
          </span>
        </div>
        {/* Ce que cette page est, avant ce qu'elle montre. Un exemple fabriqué démontrerait
            l'inverse de ce que le produit affirme : nous refusons d'avancer un chiffre que le
            lecteur ne peut pas vérifier, donc l'exemple est une analyse réelle et le dit. */}
        <p className="text-dim max-w-[680px] font-mono text-xs leading-[1.7]">
          A real analysis, run through the same pipeline as any other, then frozen into the
          repository. <span className="text-text">The numbers are untouched.</span> The player, the
          reference players and the report codes are not shown — they never agreed to be an example.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="md"
            onClick={() => void signIn('battlenet')}
            className="border-brass text-brass hover:text-brass-bright bg-transparent font-mono tracking-widest uppercase"
          >
            Run this on your own parse
          </Button>
          <Link href={HOME_PATH} className="text-dim hover:text-brass font-mono text-xs underline">
            Back to LogLense
          </Link>
        </div>
      </header>

      {/* La composition de l'écran de résultat, dans son ordre : l'aveu de comparabilité
          d'abord, le verdict ensuite, les chiffres bruts en dessous. Les mêmes composants,
          pas une maquette : ce que la page montre est ce que le produit rend. */}
      <div className="mb-6">
        <div className="mb-3">
          <ComparabilityBanner
            comparability={DEMO_BOSS_RESULT.comparability}
            earlyDeathPct={verdict.earlyDeathPct}
          />
        </div>
        <VerdictBanner result={DEMO_BOSS_RESULT} />
        <DpsBanner
          dps={DEMO_BOSS_RESULT.character.dps}
          overallPct={DEMO_BOSS_RESULT.character.overallPct}
          ilvl={verdictNamesIlvl(verdict) ? null : DEMO_BOSS_RESULT.character.stats.avgIlvl}
          killTime={DEMO_BOSS_RESULT.character.killTime}
          bossDps={DEMO_BOSS_RESULT.character.bossDps}
          bossDpsPct={DEMO_BOSS_RESULT.character.bossDpsPct}
        />
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

      <div className="mb-6">
        <Tabs tabs={[...DEMO_TABS]} active={tab} onChange={(id) => setTab(id as DemoTabId)} />
      </div>

      <div
        id={tabPanelId(tab)}
        role="tabpanel"
        aria-labelledby={tabId(tab)}
        tabIndex={0}
        className="focus-visible:outline-brass-bright min-w-0 focus-visible:outline-2"
      >
        {tab === 'overview' && (
          <OverviewTab encounter={ENCOUNTER} bossState={BOSS_STATE} specName={specName} />
        )}
        {tab === 'comparison' && (
          <ComparisonTab
            encounter={ENCOUNTER}
            bossState={BOSS_STATE}
            specName={specName}
            talentNodes={talentNodes}
          />
        )}
        {locked && (
          <div className="border-border bg-surface rounded-sm border px-5 py-6">
            <p className="text-dim max-w-[680px] font-mono text-xs leading-[1.7]">
              {locked}{' '}
              <span className="text-text">
                Both call a model in the moment, so both need an account.
              </span>
            </p>
            <div className="mt-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void signIn('battlenet')}
                className="border-brass text-brass hover:text-brass-bright bg-transparent font-mono text-xs tracking-widest uppercase"
              >
                Sign in with Battle.net
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
