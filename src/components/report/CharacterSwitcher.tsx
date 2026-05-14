'use client';

import type { ReportActor } from '@/types';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface CharacterSwitcherProps {
  actors: ReportActor[];
  selectedActorId: number;
  loading: boolean;
  onSelect: (actor: ReportActor) => void;
}

export function CharacterSwitcher({
  actors,
  selectedActorId,
  loading,
  onSelect,
}: CharacterSwitcherProps) {
  const sorted = actors.slice().sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div
      style={{
        width: '180px',
        flexShrink: 0,
        borderRight: '1px solid var(--border)',
        padding: '20px 12px 20px 0',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.65rem',
          color: 'var(--gold-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom: '10px',
          paddingLeft: '10px',
        }}
      >
        Characters
      </div>
      {sorted.map((actor) => {
        const isActive = actor.id === selectedActorId;
        const isLoading = isActive && loading;
        return (
          <button
            key={actor.id}
            onClick={() => !isLoading && onSelect(actor)}
            disabled={isLoading}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
              padding: '7px 10px',
              background: isActive ? 'rgba(198,168,74,0.08)' : 'transparent',
              border: isActive ? '1px solid var(--gold-dim)' : '1px solid transparent',
              borderRadius: '4px',
              cursor: isLoading ? 'default' : 'pointer',
              marginBottom: '3px',
              textAlign: 'left',
              gap: '6px',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.78rem',
                  color: isActive ? 'var(--gold)' : 'var(--text-dim)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {actor.name}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.65rem',
                  color: 'var(--text-dim)',
                  opacity: 0.6,
                }}
              >
                {actor.subType}
              </div>
            </div>
            {isLoading && <LoadingSpinner />}
          </button>
        );
      })}
    </div>
  );
}
