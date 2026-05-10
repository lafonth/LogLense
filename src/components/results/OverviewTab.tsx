import type { BossState } from '@/hooks/useAnalysis';
import type { Encounter } from '@/types';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { DamageBreakdown } from './DamageBreakdown';
import { DpsBanner } from './DpsBanner';
import { StatsTable } from './StatsTable';

interface OverviewTabProps {
  encounter: Encounter;
  bossState: BossState;
}

export function OverviewTab({ encounter, bossState }: OverviewTabProps) {
  if (bossState.status === 'idle' || bossState.status === 'loading') {
    return (
      <div style={{ padding: '40px 0' }}>
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
      <div
        style={{
          padding: '24px 0',
          color: 'var(--text-dim)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.85rem',
        }}
      >
        No parses found for {encounter.name}.
      </div>
    );
  }

  return (
    <div>
      <DpsBanner
        dps={result.character.dps}
        overallPct={result.character.overallPct}
        killTime={result.character.killTime}
        bossDps={result.character.bossDps}
        bossDpsPct={result.character.bossDpsPct}
      />
      <div style={{ marginTop: '20px' }}>
        <h3
          style={{
            color: 'var(--gold-dim)',
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontFamily: 'var(--font-mono)',
            marginBottom: '10px',
          }}
        >
          Stats
        </h3>
        <StatsTable character={result.character.stats} topPlayers={[]} />
      </div>
      <div style={{ marginTop: '20px' }}>
        <h3
          style={{
            color: 'var(--gold-dim)',
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontFamily: 'var(--font-mono)',
            marginBottom: '10px',
          }}
        >
          Damage breakdown
        </h3>
        <DamageBreakdown entries={result.character.damageTable.entries} />
      </div>
    </div>
  );
}
