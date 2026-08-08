import type { StatKey } from '@/lib/comparison/stat-distribution';
import type { CharacterStats, ReferenceSample } from '@/types';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { describeStats, STAT_AXES } from '@/lib/comparison/stat-distribution';

interface StatsTableProps {
  character: CharacterStats;
  sample: ReferenceSample[];
}

const FORMATTERS: Record<StatKey, (v: number) => string> = {
  avgIlvl: (v) => v.toFixed(1),
  primaryStat: (v) => Math.round(v).toLocaleString('en-US'),
  crit: (v) => Math.round(v).toLocaleString('en-US'),
  haste: (v) => Math.round(v).toLocaleString('en-US'),
  mastery: (v) => Math.round(v).toLocaleString('en-US'),
  vers: (v) => Math.round(v).toLocaleString('en-US'),
};

const CELL = 'border-border font-mono text-xs border-b px-3 py-2 text-right';
const HEADER_CELL = `${CELL} text-muted text-2xs tracking-wider uppercase`;

/**
 * L'écart à la médiane des références, pas à leur moyenne : une moyenne sur douze candidats
 * suit le meilleur d'entre eux, alors que la question posée est « où je me situe ».
 */
function DeltaBadge({ delta, format }: { delta: number; format: (v: number) => string }) {
  const pos = delta >= 0;
  return (
    <span className={`text-2xs ml-2 font-mono opacity-80 ${pos ? 'text-muted' : 'text-deviation'}`}>
      {pos ? '+' : '−'}
      {format(Math.abs(delta))}
    </span>
  );
}

export function StatsTable({ character, sample }: StatsTableProps) {
  const { stats, sampleSize, includesDisqualified } = describeStats(character, sample);

  if (stats.length === 0) {
    return (
      <ScrollArea>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${HEADER_CELL} text-left`}>Stat</th>
              <th className={HEADER_CELL}>You</th>
            </tr>
          </thead>
          <tbody>
            {STAT_AXES.map(({ key, label }) => (
              <tr key={key}>
                <td className={`${CELL} text-muted text-left`}>{label}</td>
                <td className={`${CELL} text-text`}>{FORMATTERS[key](character[key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ScrollArea>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${HEADER_CELL} text-left`}>Stat</th>
              <th className={HEADER_CELL}>You</th>
              <th className={HEADER_CELL}>Refs min</th>
              <th className={HEADER_CELL}>Refs median</th>
              <th className={HEADER_CELL}>Refs max</th>
              <th className={HEADER_CELL}>Your position</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((stat) => {
              const fmt = FORMATTERS[stat.key];
              return (
                <tr key={stat.key}>
                  <td className={`${CELL} text-muted text-left`}>{stat.label}</td>
                  <td className={`${CELL} text-text`}>
                    {fmt(stat.mine)}
                    <DeltaBadge delta={stat.mine - stat.median} format={fmt} />
                  </td>
                  <td className={`${CELL} text-muted`}>{fmt(stat.min)}</td>
                  <td className={`${CELL} text-text`}>{fmt(stat.median)}</td>
                  <td className={`${CELL} text-muted`}>{fmt(stat.max)}</td>
                  <td className={`${CELL} text-text`}>p{stat.percentile}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollArea>
      <p className="text-2xs text-muted px-3">
        Distribution over <span className="font-mono">{sampleSize}</span> comparable logs
        {includesDisqualified && (
          <span className="text-danger">
            {' '}
            — none of them passed the eliminatory criteria, so the field is not comparable
          </span>
        )}
        .
      </p>
    </div>
  );
}
