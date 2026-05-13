import type { CastEntry, RotationSummary, TopPlayer } from '@/types';

interface RotationTableProps {
  character: RotationSummary;
  topPlayers: TopPlayer[];
}

const cellStyle: React.CSSProperties = {
  padding: '5px 10px',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.8rem',
  borderBottom: '1px solid rgba(42,37,53,0.5)',
  textAlign: 'right',
};

const headerCellStyle: React.CSSProperties = {
  padding: '5px 10px',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.72rem',
  color: 'var(--gold-dim)',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  textAlign: 'right',
  borderBottom: '1px solid var(--border)',
};

function dotColor(ratio: number | null): string | null {
  if (ratio === null) return null;
  if (ratio >= 0.9) return 'var(--gold-dim)';
  if (ratio >= 0.7) return '#b87333';
  return 'var(--crimson)';
}

function castRatio(mine: CastEntry | undefined, topPlayers: TopPlayer[], ability: string): number | null {
  const topVals = topPlayers.map((p) => p.rotation.casts[ability]?.perMin ?? 0);
  const topAvg = topVals.reduce((a, b) => a + b, 0) / topVals.length;
  if (topAvg === 0) return null; // tops don't use it
  if (!mine) return 0; // user doesn't use it but tops do
  return mine.perMin / topAvg;
}

function uptimeRatio(userPct: number, topPlayers: TopPlayer[], ability: string): number | null {
  const topVals = topPlayers.map((p) => p.rotation.buffs[ability] ?? 0);
  const topAvg = topVals.reduce((a, b) => a + b, 0) / topVals.length;
  if (topAvg === 0) return null;
  return userPct / topAvg;
}

function StatusDot({ ratio }: { ratio: number | null }) {
  const color = dotColor(ratio);
  if (!color) return null;
  return (
    <span
      style={{
        display: 'inline-block',
        width: '7px',
        height: '7px',
        borderRadius: '50%',
        background: color,
        marginRight: '6px',
        verticalAlign: 'middle',
        flexShrink: 0,
      }}
    />
  );
}

export function RotationTable({ character, topPlayers }: RotationTableProps) {
  // Union of all ability names across character + top players, ordered by character cast count
  const allAbilities = [
    ...new Set([
      ...Object.keys(character.casts),
      ...topPlayers.flatMap((p) => Object.keys(p.rotation.casts)),
    ]),
  ].sort((a, b) => (character.casts[b]?.casts ?? 0) - (character.casts[a]?.casts ?? 0));

  // Buffs the character actively cast (appear in both casts and buffs), with >0% uptime
  const activeBufEntries = Object.entries(character.buffs).filter(
    ([name, pct]) => character.casts[name] !== undefined && pct > 0
  );

  return (
    <div style={{ marginTop: '16px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...headerCellStyle, textAlign: 'left' }}>Ability</th>
            <th style={headerCellStyle}>You /min</th>
            {topPlayers.map((p, i) => (
              <th key={p.stats.name} style={headerCellStyle}>
                P{i + 1} /min
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allAbilities.map((ability) => {
            const mine = character.casts[ability];
            const ratio = castRatio(mine, topPlayers, ability);
            return (
              <tr key={ability}>
                <td style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-dim)' }}>
                  {ability}
                </td>
                <td style={{ ...cellStyle, color: 'var(--text)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <StatusDot ratio={ratio} />
                    {mine ? mine.perMin.toFixed(2) : '—'}
                  </span>
                </td>
                {topPlayers.map((p) => {
                  const entry = p.rotation.casts[ability];
                  return (
                    <td key={p.stats.name} style={{ ...cellStyle, color: 'var(--text-dim)' }}>
                      {entry ? entry.perMin.toFixed(2) : '—'}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {activeBufEntries.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px' }}>
          <thead>
            <tr>
              <th style={{ ...headerCellStyle, textAlign: 'left' }}>Uptime</th>
              <th style={headerCellStyle}>You</th>
              {topPlayers.map((p, i) => (
                <th key={p.stats.name} style={headerCellStyle}>
                  P{i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeBufEntries.map(([name, pct]) => {
              const ratio = uptimeRatio(pct, topPlayers, name);
              return (
                <tr key={name}>
                  <td style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-dim)' }}>
                    {name}
                  </td>
                  <td style={{ ...cellStyle, color: 'var(--text)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      <StatusDot ratio={ratio} />
                      {pct}%
                    </span>
                  </td>
                {topPlayers.map((p) => (
                  <td key={p.stats.name} style={{ ...cellStyle, color: 'var(--text-dim)' }}>
                    {p.rotation.buffs[name] ?? 0}%
                  </td>
                ))}
              </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
