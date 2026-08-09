import type { AbilityComparison } from '@/lib/comparison/rotation-stats';
import type { DamageEntry, RotationSummary, TopPlayer } from '@/types';
import { Card } from '@/components/ui/Card';
import { compareCasts, compareUptimes } from '@/lib/comparison/rotation-stats';

interface RotationCardsProps {
  character: RotationSummary;
  topPlayers: TopPlayer[];
  /** Ce qui pondère le tri des casts : sans elle, l'ordre retombe sur la déviation seule. */
  characterDamage: DamageEntry[];
}

function formatDeviation(pct: number): string {
  // U+2212 minus sign, not a hyphen — it aligns with digits in a monospace face.
  const sign = pct < 0 ? '−' : '+';
  return `${sign}${Math.abs(pct).toFixed(1)} %`;
}

function AbilityCard({ row, unit }: { row: AbilityComparison; unit: string }) {
  const hasRange = row.referenceMedian !== null;
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
        <div
          className="bg-border relative mt-2 h-1 rounded-full"
          data-testid="rotation-bar"
          aria-hidden="true"
        >
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
          {row.damageShare !== null && row.damageShare > 0 && (
            <>
              {' · '}
              <span className="font-mono">{(row.damageShare * 100).toFixed(1)} %</span> of damage
            </>
          )}
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

interface RotationComparisonCardsProps {
  casts: AbilityComparison[];
  uptimes: AbilityComparison[];
  /** Aucune référence disponible : le libellé et la note doivent le dire, pas juste se taire. */
  showEmptyReferenceNote?: boolean;
}

/** La partie présentationnelle : reçoit des comparaisons déjà calculées, n'en calcule aucune.
 *  Séparée de `RotationCards` pour que le mode pull-comparison, dont la référence unique vient
 *  déjà de `comparePulls`, l'utilise sans repasser par `compareCasts`/`compareUptimes`. */
export function RotationComparisonCards({
  casts,
  uptimes,
  showEmptyReferenceNote,
}: RotationComparisonCardsProps) {
  // Le libellé doit dire ce que l'ordre suit réellement : sans table de dégâts, la
  // pondération n'a pas eu lieu et annoncer un coût serait un mensonge.
  const weighted = casts.some((row) => (row.damageShare ?? 0) > 0);

  return (
    <div className="flex flex-col gap-4">
      <Card
        header={
          showEmptyReferenceNote
            ? 'Rotation'
            : weighted
              ? 'Rotation · by cost'
              : 'Rotation · by deviation'
        }
      >
        {showEmptyReferenceNote && (
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

export function RotationCards({ character, topPlayers, characterDamage }: RotationCardsProps) {
  const casts = compareCasts(character, topPlayers, characterDamage);
  const uptimes = compareUptimes(character, topPlayers).filter((row) => row.mine > 0);

  return (
    <RotationComparisonCards
      casts={casts}
      uptimes={uptimes}
      showEmptyReferenceNote={topPlayers.length === 0}
    />
  );
}
