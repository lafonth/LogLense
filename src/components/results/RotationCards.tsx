import type { AbilityComparison } from '@/lib/comparison/rotation-stats';
import type { RotationSummary, TopPlayer } from '@/types';
import { Card } from '@/components/ui/Card';
import { compareCasts, compareUptimes } from '@/lib/comparison/rotation-stats';

interface RotationCardsProps {
  character: RotationSummary;
  topPlayers: TopPlayer[];
}

function formatDeviation(pct: number): string {
  // U+2212 minus sign, not a hyphen — it aligns with digits in a monospace face.
  const sign = pct < 0 ? '−' : '+';
  return `${sign}${Math.abs(pct).toFixed(1)} %`;
}

function AbilityCard({ row, unit }: { row: AbilityComparison; unit: string }) {
  const hasRange = row.referenceMin !== null && row.referenceMax !== null;
  const scale = Math.max(row.referenceMax ?? 0, row.mine) * 1.1 || 1;
  const bandLeft = hasRange ? (row.referenceMin! / scale) * 100 : 0;
  const bandWidth = hasRange ? ((row.referenceMax! - row.referenceMin!) / scale) * 100 : 0;
  const markerLeft = (row.mine / scale) * 100;

  return (
    <li className="border-border bg-surface-raised rounded-sm border p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-text font-sans text-xs">{row.name}</span>
        {row.deviationPct !== null && (
          <span className="text-deviation shrink-0 font-mono text-xs">
            {formatDeviation(row.deviationPct)}
          </span>
        )}
      </div>

      {hasRange && (
        <div className="bg-border relative mt-2 h-1 rounded-full" data-testid="rotation-bar">
          <div
            className="bg-border-strong absolute h-1 rounded-full"
            style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
          />
          <div
            className="bg-deviation absolute -top-1 h-3 w-0.5"
            style={{ left: `${markerLeft}%` }}
          />
        </div>
      )}

      <div className="text-2xs text-dim mt-2 flex justify-between">
        <span>
          you <span className="text-text font-mono">{row.mine.toFixed(2)}</span> {unit}
        </span>
        {hasRange && (
          <span>
            references{' '}
            <span className="font-mono">
              {row.referenceMin!.toFixed(2)} – {row.referenceMax!.toFixed(2)}
            </span>
          </span>
        )}
      </div>
    </li>
  );
}

export function RotationCards({ character, topPlayers }: RotationCardsProps) {
  const casts = compareCasts(character, topPlayers);
  const uptimes = compareUptimes(character, topPlayers).filter((row) => row.mine > 0);

  return (
    <div className="flex flex-col gap-4">
      <Card header={topPlayers.length > 0 ? 'Rotation · by deviation' : 'Rotation'}>
        {topPlayers.length === 0 && (
          <p className="text-2xs text-muted mb-3 font-sans">
            No comparable logs — showing your rotation only.
          </p>
        )}
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {casts.map((row) => (
            <AbilityCard key={row.name} row={row} unit="/min" />
          ))}
        </ul>
      </Card>

      {uptimes.length > 0 && (
        <Card header="Uptime">
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {uptimes.map((row) => (
              <AbilityCard key={row.name} row={row} unit="%" />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
