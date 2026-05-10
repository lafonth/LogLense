import type { TopPlayer } from '@/types';

interface TalentDiffProps {
  myTalents: Record<number, number>;
  topPlayers: TopPlayer[];
}

export function TalentDiff({ myTalents, topPlayers }: TalentDiffProps) {
  if (topPlayers.length === 0) return null;

  const mySet = new Set(Object.keys(myTalents));
  const topSets = topPlayers.map((p) => new Set(Object.keys(p.stats.talents)));

  const onlyMe = [...mySet].filter((id) => topSets.every((s) => !s.has(id)));
  const onlyAll = topSets
    .flatMap((s) => [...s])
    .filter((id) => !mySet.has(id) && topSets.every((s) => s.has(id)))
    .filter((id, i, arr) => arr.indexOf(id) === i);

  if (onlyMe.length === 0 && onlyAll.length === 0) {
    return (
      <p style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
        Talent builds match top players.
      </p>
    );
  }

  const chipStyle = (variant: 'mine' | 'theirs'): React.CSSProperties => ({
    display: 'inline-block',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.75rem',
    padding: '2px 8px',
    border: `1px solid ${variant === 'mine' ? 'var(--crimson)' : 'var(--gold-dim)'}`,
    borderRadius: '3px',
    color: variant === 'mine' ? 'var(--crimson)' : 'var(--gold)',
    margin: '2px',
  });

  return (
    <div style={{ marginTop: '12px' }}>
      {onlyMe.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              color: 'var(--text-dim)',
              display: 'block',
              marginBottom: '4px',
            }}
          >
            YOU ONLY
          </span>
          {onlyMe.map((id) => (
            <span key={id} style={chipStyle('mine')}>
              ID {id}
            </span>
          ))}
        </div>
      )}
      {onlyAll.length > 0 && (
        <div>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              color: 'var(--text-dim)',
              display: 'block',
              marginBottom: '4px',
            }}
          >
            TOP PLAYERS ONLY
          </span>
          {onlyAll.map((id) => (
            <span key={id} style={chipStyle('theirs')}>
              ID {id}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
