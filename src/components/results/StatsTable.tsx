import type { CharacterStats, TopPlayer } from '@/types';
import { ScrollArea } from '@/components/ui/ScrollArea';

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

const CELL = 'border-border font-mono text-xs border-b px-3 py-2 text-right';
const HEADER_CELL = `${CELL} text-muted text-2xs tracking-[0.07em] uppercase`;

function avgTopStat(topPlayers: TopPlayer[], key: keyof CharacterStats): number {
  if (topPlayers.length === 0) return 0;
  const nums = topPlayers.map((p) => p.stats[key] as number);
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function DeltaBadge({ delta }: { delta: number }) {
  const pos = delta >= 0;
  return (
    <span className={`text-2xs ml-2 font-mono opacity-80 ${pos ? 'text-muted' : 'text-deviation'}`}>
      {pos ? '+' : '−'}
      {Math.abs(Math.round(delta)).toLocaleString('en-US')}
    </span>
  );
}

export function StatsTable({ character, topPlayers }: StatsTableProps) {
  return (
    <ScrollArea>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={`${HEADER_CELL} text-left`}>Stat</th>
            <th className={HEADER_CELL}>You</th>
            {topPlayers.map((p, i) => (
              <th key={p.stats.name} className={HEADER_CELL}>
                P{i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {STAT_ROWS.map(({ label, key, fmt }) => {
            const delta =
              topPlayers.length > 0
                ? (character[key] as number) - avgTopStat(topPlayers, key)
                : null;
            return (
              <tr key={label}>
                <td className={`${CELL} text-muted text-left`}>{label}</td>
                <td className={`${CELL} text-text`}>
                  {fmt(character[key])}
                  {delta !== null && <DeltaBadge delta={delta} />}
                </td>
                {topPlayers.map((p) => (
                  <td key={p.stats.name} className={`${CELL} text-muted`}>
                    {fmt(p.stats[key])}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollArea>
  );
}
