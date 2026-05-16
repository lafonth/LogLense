import type { CharacterStats, TopPlayer } from '@/types';

interface StatsTableProps {
  character: CharacterStats;
  topPlayers: TopPlayer[];
}

const STAT_ROWS: { label: string; key: keyof CharacterStats; fmt: (v: unknown) => string }[] = [
  { label: 'Avg ilvl', key: 'avgIlvl', fmt: (v) => (v as number).toFixed(1) },
  { label: 'Primary Stat', key: 'primaryStat', fmt: (v) => (v as number).toLocaleString('en-US') },
  { label: 'Crit', key: 'crit', fmt: (v) => (v as number).toLocaleString('en-US') },
  { label: 'Haste', key: 'haste', fmt: (v) => (v as number).toLocaleString('en-US') },
  { label: 'Mastery', key: 'mastery', fmt: (v) => (v as number).toLocaleString('en-US') },
  { label: 'Versatility', key: 'vers', fmt: (v) => (v as number).toLocaleString('en-US') },
];

const cellStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.82rem',
  borderBottom: '1px solid var(--border)',
  textAlign: 'right',
};

const headerCellStyle: React.CSSProperties = {
  ...cellStyle,
  color: 'var(--gold-dim)',
  fontSize: '0.72rem',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
};

function avgTopStat(topPlayers: TopPlayer[], key: keyof CharacterStats): number {
  if (topPlayers.length === 0) return 0;
  const nums = topPlayers.map((p) => p.stats[key] as number);
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function DeltaBadge({ delta }: { delta: number }) {
  const pos = delta >= 0;
  return (
    <span
      style={{
        color: pos ? 'var(--gold-dim)' : 'var(--crimson)',
        fontSize: '0.7rem',
        marginLeft: '8px',
        opacity: 0.85,
      }}
    >
      {pos ? '+' : '−'}
      {Math.abs(Math.round(delta)).toLocaleString('en-US')}
    </span>
  );
}

export function StatsTable({ character, topPlayers }: StatsTableProps) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ ...headerCellStyle, textAlign: 'left' }}>Stat</th>
          <th style={headerCellStyle}>You</th>
          {topPlayers.map((p, i) => (
            <th key={p.stats.name} style={headerCellStyle}>
              P{i + 1}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {STAT_ROWS.map(({ label, key, fmt }) => {
          const delta =
            topPlayers.length > 0 ? (character[key] as number) - avgTopStat(topPlayers, key) : null;
          return (
            <tr key={label}>
              <td style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-dim)' }}>{label}</td>
              <td style={{ ...cellStyle, color: 'var(--text)' }}>
                {fmt(character[key])}
                {delta !== null && <DeltaBadge delta={delta} />}
              </td>
              {topPlayers.map((p) => (
                <td key={p.stats.name} style={{ ...cellStyle, color: 'var(--text-dim)' }}>
                  {fmt(p.stats[key])}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
