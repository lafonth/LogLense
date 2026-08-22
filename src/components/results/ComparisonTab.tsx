import type { BossState } from '@/hooks/useAnalysis';
import type { Encounter, TalentNode } from '@/types';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { usableSample } from '@/lib/comparison/stat-distribution';
import { buildVerdict } from '@/lib/comparison/verdict';
import { ComparabilityBanner } from './ComparabilityBanner';
import { OpeningChain } from './OpeningChain';
import { ReferenceLabels } from './ReferenceLabels';
import { RotationCards } from './RotationCards';
import { StatsTable } from './StatsTable';
import { TalentDiff } from './TalentDiff';

interface ComparisonTabProps {
  encounter: Encounter;
  bossState: BossState;
  specName: string;
  talentNodes: TalentNode[];
  /** Une seconde chance sur ce boss seul. Absent quand le chemin n'en offre pas. */
  onRetry?: () => void;
}

export function ComparisonTab({
  encounter,
  bossState,
  specName,
  talentNodes,
  onRetry,
}: ComparisonTabProps) {
  if (bossState.status === 'idle' || bossState.status === 'loading') {
    return (
      <div role="status" className="py-8">
        <LoadingSpinner label={`Fetching ${encounter.name}…`} />
      </div>
    );
  }

  if (bossState.status === 'error') {
    return <ErrorBanner message={bossState.message} onRetry={onRetry} />;
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
      <div className="mt-6">
        <ComparabilityBanner
          comparability={result.comparability}
          earlyDeathPct={buildVerdict(result).earlyDeathPct}
        />
      </div>
      <div className="mt-6">
        <ReferenceLabels result={result} />
      </div>
      <div className="mt-6">
        <h3 className="text-muted mb-2 font-mono text-xs tracking-wider uppercase">
          Where you sit in the field
        </h3>
        <StatsTable character={result.character.stats} sample={result.sample} />
      </div>
      <div className="mt-6">
        <OpeningChain mine={result.character.rotation.opening} references={result.topPlayers} />
      </div>
      <div className="mt-6">
        <RotationCards
          character={result.character.rotation}
          topPlayers={result.topPlayers}
          characterDamage={result.character.damageTable.entries}
        />
      </div>
      <div className="mt-6">
        <TalentDiff
          nodes={talentNodes}
          myTalents={result.character.stats.talents}
          references={usableSample(result.sample).entries}
        />
      </div>
    </div>
  );
}
