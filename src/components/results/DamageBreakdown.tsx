import type { DamageEntry } from '@/types';

interface DamageBreakdownProps {
  entries: DamageEntry[];
}

export function DamageBreakdown({ entries }: DamageBreakdownProps) {
  const total = entries.reduce((sum, e) => sum + e.total, 0);
  const top10 = entries
    .slice()
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return (
    <div style={{ marginTop: '16px' }}>
      {top10.map((entry) => {
        const pct = total > 0 ? (entry.total / total) * 100 : 0;
        return (
          <div key={entry.name} style={{ marginBottom: '6px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.78rem',
                marginBottom: '2px',
              }}
            >
              <span style={{ color: 'var(--text-dim)' }}>{entry.name}</span>
              <span style={{ color: 'var(--text)' }}>{pct.toFixed(1)}%</span>
            </div>
            <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px' }}>
              <div
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: 'var(--gold)',
                  borderRadius: '2px',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
