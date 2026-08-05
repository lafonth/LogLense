import type { BossState } from '@/hooks/useAnalysis';
import type { Encounter, TalentNode } from '@/types';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { DpsBanner } from './DpsBanner';
import { RotationCards } from './RotationCards';
import { StatsTable } from './StatsTable';
import { TalentDiff } from './TalentDiff';

interface ComparisonTabProps {
  encounter: Encounter;
  bossState: BossState;
  specName: string;
  talentNodes: TalentNode[];
}

export function ComparisonTab({ encounter, bossState, specName, talentNodes }: ComparisonTabProps) {
  if (bossState.status === 'idle' || bossState.status === 'loading') {
    return (
      <div className="py-8">
        <LoadingSpinner label={`Fetching ${encounter.name}…`} />
      </div>
    );
  }

  if (bossState.status === 'error') {
    return <ErrorBanner message={bossState.message} />;
  }

  const result = bossState.result;

  if (!result) {
    return (
      <div className="py-6 font-mono text-xs">
        <div className="text-dim">
          No {specName} parses found for {encounter.name}.
        </div>
        <div className="text-dim mt-2 text-xs">
          Try switching to Heroic or Normal — Mythic requires a kill logged while playing {specName}{' '}
          spec.
        </div>
      </div>
    );
  }

  return (
    <div>
      <DpsBanner
        dps={result.character.dps}
        overallPct={result.character.overallPct}
        ilvl={result.character.stats.avgIlvl}
        killTime={result.character.killTime}
        bossDps={result.character.bossDps}
        bossDpsPct={result.character.bossDpsPct}
      />
      <div className="mt-6">
        <h3 className="text-muted mb-2 font-mono text-xs tracking-[0.08em] uppercase">
          Stats vs top players
        </h3>
        <StatsTable character={result.character.stats} topPlayers={result.topPlayers} />
      </div>
      <div className="mt-6">
        <RotationCards character={result.character.rotation} topPlayers={result.topPlayers} />
      </div>
      <div className="mt-6">
        <TalentDiff
          nodes={talentNodes}
          myTalents={result.character.stats.talents}
          topPlayers={result.topPlayers}
        />
      </div>
    </div>
  );
}
