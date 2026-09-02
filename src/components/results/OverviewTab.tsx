import type { BossState } from '@/hooks/useAnalysis';
import type { Encounter } from '@/types';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { isBossRefusal, isBossResult } from '@/lib/boss-outcome';
import { DamageBreakdown } from './DamageBreakdown';
import { StatsTable } from './StatsTable';
import { TrajectoryChart } from './TrajectoryChart';

interface OverviewTabProps {
  encounter: Encounter;
  bossState: BossState;
  specName: string;
  /** Une seconde chance sur ce boss seul. Absent quand le chemin n'en offre pas. */
  onRetry?: () => void;
}

export function OverviewTab({ encounter, bossState, specName, onRetry }: OverviewTabProps) {
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
    return <ErrorBanner message={bossState.message} onRetry={onRetry} />;
  }

  const outcome = bossState.result;

  // Un refus n'est pas une absence de parse. Le dire « aucun parse trouvé » enverrait le
  // lecteur changer de difficulté pour un problème qui n'en dépend pas — et c'est ce
  // conseil-là, donné à une Prêtre Sacré, qui a fait passer un rapport faux pour un rapport
  // vide. La raison complète est au-dessus des onglets ; ici on ne dit que le fait.
  if (isBossRefusal(outcome)) {
    return (
      <div className="py-6 font-mono text-xs">
        <div className="text-dim">
          {encounter.name} was not compared — the log shows{' '}
          {outcome.specLabel ?? `spec ${outcome.specId}`}, which LogLense does not rank.
        </div>
      </div>
    );
  }

  const result = isBossResult(outcome) ? outcome : null;

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
        <DamageBreakdown
          entries={result.character.damageTable.entries}
          icons={result.character.rotation.icons}
        />
      </div>
    </div>
  );
}
