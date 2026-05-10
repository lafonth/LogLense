import type { BossState } from '@/hooks/useAnalysis';
import type { Encounter } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface BossSidebarProps {
  encounters: Encounter[];
  bossStates: BossState[];
  activeIdx: number;
  onSelect: (idx: number) => void;
}

export function BossSidebar({ encounters, bossStates, activeIdx, onSelect }: BossSidebarProps) {
  return (
    <div
      style={{
        width: '200px',
        flexShrink: 0,
        borderRight: '1px solid var(--border)',
        paddingRight: '16px',
      }}
    >
      {encounters.map((enc, i) => {
        const state = bossStates[i];
        const isActive = i === activeIdx;
        const pct =
          state?.status === 'success' && state.result ? state.result.character.overallPct : null;

        return (
          <button
            key={enc.id}
            onClick={() => onSelect(i)}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
              padding: '8px 10px',
              background: isActive ? 'rgba(198,168,74,0.08)' : 'transparent',
              border: isActive ? '1px solid var(--gold-dim)' : '1px solid transparent',
              borderRadius: '4px',
              cursor: 'pointer',
              marginBottom: '4px',
              textAlign: 'left',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.78rem',
                color: isActive ? 'var(--gold)' : 'var(--text-dim)',
              }}
            >
              {enc.name}
            </span>
            {state?.status === 'loading' && <LoadingSpinner />}
            {state?.status === 'success' && pct !== null && <Badge pct={pct} size="sm" />}
            {state?.status === 'error' && (
              <span style={{ color: 'var(--crimson)', fontSize: '0.7rem' }}>err</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
