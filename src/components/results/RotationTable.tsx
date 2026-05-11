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
  ...cellStyle,
  color: 'var(--gold-dim)',
  fontSize: '0.7rem',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  paddingTop: '10px',
};

function Section({
  title,
  entries,
  character,
  topPlayers,
  sectionKey,
}: {
  title: string;
  entries: string[];
  character: Record<string, CastEntry>;
  topPlayers: TopPlayer[];
  sectionKey: string;
}) {
  return (
    <>
      <tr>
        <td
          colSpan={2 + topPlayers.length}
          style={{ ...headerCellStyle, textAlign: 'left', paddingLeft: '10px' }}
        >
          {title}
        </td>
      </tr>
      {entries.map((ability) => {
        const myEntry = character[ability];
        const myCpm = myEntry ? myEntry.perMin.toFixed(2) : '—';
        return (
          <tr key={`${sectionKey}-${ability}`}>
            <td style={{ ...cellStyle, textAlign: 'left', color: 'var(--text-dim)' }}>{ability}</td>
            <td style={{ ...cellStyle, color: 'var(--text)' }}>{myCpm}</td>
            {topPlayers.map((p) => {
              const entry = (p.rotation.cooldowns[ability] ??
                p.rotation.generators[ability] ??
                p.rotation.finishers[ability]) as CastEntry | undefined;
              return (
                <td key={p.stats.name} style={{ ...cellStyle, color: 'var(--text-dim)' }}>
                  {entry ? entry.perMin.toFixed(2) : '—'}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

export function RotationTable({ character, topPlayers }: RotationTableProps) {
  const tableHeaderCellStyle: React.CSSProperties = {
    padding: '5px 10px',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.72rem',
    color: 'var(--gold-dim)',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    textAlign: 'right',
    borderBottom: '1px solid var(--border)',
  };

  return (
    <div style={{ marginTop: '16px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...tableHeaderCellStyle, textAlign: 'left' }}>Ability</th>
            <th style={tableHeaderCellStyle}>You /min</th>
            {topPlayers.map((p, i) => (
              <th key={p.stats.name} style={tableHeaderCellStyle}>
                P{i + 1} /min
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <Section
            title="Cooldowns"
            entries={Object.keys(character.cooldowns)}
            character={character.cooldowns}
            topPlayers={topPlayers}
            sectionKey="cooldowns"
          />
          <Section
            title="Generators"
            entries={Object.keys(character.generators)}
            character={character.generators}
            topPlayers={topPlayers}
            sectionKey="generators"
          />
          <Section
            title="Finishers"
            entries={Object.keys(character.finishers)}
            character={character.finishers}
            topPlayers={topPlayers}
            sectionKey="finishers"
          />
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px' }}>
        <thead>
          <tr>
            <th style={{ ...tableHeaderCellStyle, textAlign: 'left' }}>Uptime</th>
            <th style={tableHeaderCellStyle}>You</th>
            {topPlayers.map((p, i) => (
              <th key={p.stats.name} style={tableHeaderCellStyle}>
                P{i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(character.uptime).map(([key, val]) => (
            <tr key={key}>
              <td
                style={{
                  padding: '5px 10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem',
                  color: 'var(--text-dim)',
                  borderBottom: '1px solid rgba(42,37,53,0.5)',
                }}
              >
                {key}
              </td>
              <td
                style={{
                  padding: '5px 10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem',
                  color: 'var(--text)',
                  textAlign: 'right',
                  borderBottom: '1px solid rgba(42,37,53,0.5)',
                }}
              >
                {val}%
              </td>
              {topPlayers.map((p) => (
                <td
                  key={p.stats.name}
                  style={{
                    padding: '5px 10px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8rem',
                    color: 'var(--text-dim)',
                    textAlign: 'right',
                    borderBottom: '1px solid rgba(42,37,53,0.5)',
                  }}
                >
                  {p.rotation.uptime?.[key] ?? 0}%
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
