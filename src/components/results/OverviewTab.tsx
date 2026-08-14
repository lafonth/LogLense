import type { BossState } from '@/hooks/useAnalysis';
import type { Encounter } from '@/types';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { DamageBreakdown } from './DamageBreakdown';
import { DpsBanner } from './DpsBanner';
import { StatsTable } from './StatsTable';
import { TrajectoryChart } from './TrajectoryChart';

interface OverviewTabProps {
  encounter: Encounter;
  bossState: BossState;
  specName: string;
}

export function OverviewTab({ encounter, bossState, specName }: OverviewTabProps) {
  if (bossState.status === 'idle' || bossState.status === 'loading') {
    return (
      // Le panneau change de contenu sur place quand on passe d'un boss à l'autre : sans
      // région vive, le remplacement est silencieux et rien ne dit que la requête est partie.
      <div role="status" className="py-8">
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
      {/* Avant les stats : le rapport isolé décrit un soir, la trajectoire le situe. Le
          composant se tait entièrement — titre compris — quand la source n'a rendu qu'un kill. */}
      <TrajectoryChart trajectory={result.character.trajectory} />
      <div className="mt-6">
        <h3 className="text-muted mb-2 font-mono text-xs tracking-wider uppercase">Stats</h3>
        <StatsTable character={result.character.stats} sample={[]} />
      </div>
      <div className="mt-6">
        <h3 className="text-muted mb-2 font-mono text-xs tracking-wider uppercase">
          Damage breakdown
        </h3>
        <DamageBreakdown entries={result.character.damageTable.entries} />
      </div>
    </div>
  );
}
