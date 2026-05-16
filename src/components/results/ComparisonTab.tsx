import type { BossState } from '@/hooks/useAnalysis';
import type { Encounter, TalentNode } from '@/types';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { DpsBanner } from './DpsBanner';
import { RotationTable } from './RotationTable';
import { StatsTable } from './StatsTable';
import { TalentTree } from './TalentTree';

interface ComparisonTabProps {
  encounter: Encounter;
  bossState: BossState;
  specName: string;
  talentNodes: TalentNode[];
}

export function ComparisonTab({ encounter, bossState, specName, talentNodes }: ComparisonTabProps) {
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
      <div style={{ padding: '24px 0', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
        <div style={{ color: 'var(--text-dim)' }}>
          No {specName} parses found for {encounter.name}.
        </div>
        <div style={{ color: 'var(--text-dim)', marginTop: '6px', fontSize: '0.78rem' }}>
          Try switching to Heroic or Normal — Mythic requires a kill logged while playing {specName}{' '}
          spec.
        </div>
      </div>
    );
  }

  if (result.topPlayers.length === 0) {
    return (
      <div
        style={{
          padding: '24px 0',
          color: 'var(--text-dim)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.85rem',
        }}
      >
        No similar kill-time players found for comparison.
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
          Stats vs top players
        </h3>
        <StatsTable character={result.character.stats} topPlayers={result.topPlayers} />
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
          Rotation
        </h3>
        <RotationTable character={result.character.rotation} topPlayers={result.topPlayers} />
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
          Talents
        </h3>
        <TalentTree
          nodes={talentNodes}
          myTalents={result.character.stats.talents}
          topPlayers={result.topPlayers}
        />
      </div>
    </div>
  );
}
