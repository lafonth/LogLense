import type { AbilityGroup } from '@/lib/comparison/ability-groups';
import type { AbilityComparison } from '@/lib/comparison/rotation-stats';
import type { DamageEntry, RotationSummary, TopPlayer } from '@/types';
import { Card } from '@/components/ui/Card';
import { groupCasts, groupUptimes } from '@/lib/comparison/ability-groups';
import { compareCasts, compareUptimes, inReferenceBand } from '@/lib/comparison/rotation-stats';

interface RotationCardsProps {
  character: RotationSummary;
  topPlayers: TopPlayer[];
  /** Ce qui pondère le tri des casts : sans elle, l'ordre retombe sur la déviation seule. */
  characterDamage: DamageEntry[];
  /** Voir {@link RotationComparisonCardsProps.foldMatching}. */
  foldMatching?: boolean;
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
        {/* `damageShare` est ce qui pilote le tri : elle se lit à côté du nom, pas en pied de
            carte. Un ordre dont la grandeur est enterrée en `text-2xs` ne se voit pas. */}
        <span className="min-w-0 truncate">
          <span className="text-text font-sans text-xs">{row.name}</span>
          {row.damageShare !== null && row.damageShare > 0 && (
            <span className="text-2xs text-muted ml-2 font-mono">
              {(row.damageShare * 100).toFixed(1)} % of damage
            </span>
          )}
        </span>
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

/** Les blocs d'une carte. La grille reste *à l'intérieur* d'un groupe : sur deux colonnes,
 *  une grille partagée laisserait la fin d'un groupe et le début du suivant sur la même
 *  ligne, et l'en-tête ne dirait plus de quoi il est le titre. */
function GroupedAbilities({
  groups,
  unit,
  fullWidth,
}: {
  groups: AbilityGroup[];
  unit: string;
  /** Une colonne unique : l'œil descend le classement au lieu de balayer en Z. */
  fullWidth?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-2">
          {group.label !== '' && <h3 className="text-2xs text-muted font-sans">{group.label}</h3>}
          <ul
            className={fullWidth ? 'flex flex-col gap-2' : 'grid grid-cols-1 gap-2 md:grid-cols-2'}
          >
            {group.rows.map((row) => (
              <AbilityCard key={row.name} row={row} unit={unit} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

interface RotationComparisonCardsProps {
  casts: AbilityComparison[];
  uptimes: AbilityComparison[];
  /** Aucune référence disponible : le libellé et la note doivent le dire, pas juste se taire. */
  showEmptyReferenceNote?: boolean;
  /**
   * Replie sous un `<details>` tout ce qui tombe dans la fourchette des références, et laisse
   * déplié ce qui en sort. Optionnel et inactif par défaut : le mode pull-comparison réutilise
   * ce composant tel quel, et sa référence unique ne dessine pas une fourchette qu'on aurait le
   * droit de traiter comme un consensus.
   */
  foldMatching?: boolean;
}

/** La partie présentationnelle : reçoit des comparaisons déjà calculées, n'en calcule aucune.
 *  Séparée de `RotationCards` pour que le mode pull-comparison, dont la référence unique vient
 *  déjà de `comparePulls`, l'utilise sans repasser par `compareCasts`/`compareUptimes`. */
export function RotationComparisonCards({
  casts,
  uptimes,
  showEmptyReferenceNote,
  foldMatching,
}: RotationComparisonCardsProps) {
  // Le libellé doit dire ce que l'ordre suit réellement : sans table de dégâts, la
  // pondération n'a pas eu lieu et annoncer un coût serait un mensonge.
  const weighted = casts.some((row) => (row.damageShare ?? 0) > 0);
  // `casts` porte déjà l'union des noms de tous les côtés — `compare` unionne mes clés et
  // celles des références. Le référentiel se déduit donc sur place, sans prop supplémentaire,
  // et vaut aussi pour la comparaison de pulls, qui passe par les mêmes fonctions.
  const castNames = new Set(casts.map((row) => row.name));

  // Le partage se fait *avant* le groupement : `partition` n'émet jamais de groupe vide, donc
  // aucun en-tête orphelin ne peut sortir d'un côté qui s'est retrouvé sans ligne.
  const shownCasts = foldMatching ? casts.filter((row) => !inReferenceBand(row)) : casts;
  const shownUptimes = foldMatching ? uptimes.filter((row) => !inReferenceBand(row)) : uptimes;
  const matchingCasts = foldMatching ? casts.filter(inReferenceBand) : [];
  const matchingUptimes = foldMatching ? uptimes.filter(inReferenceBand) : [];
  const matching = matchingCasts.length + matchingUptimes.length;

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
        {shownCasts.length > 0 ? (
          <GroupedAbilities groups={groupCasts(shownCasts)} unit="/min" fullWidth={foldMatching} />
        ) : (
          <p className="text-muted font-sans text-xs">
            Every ability sits inside the reference range.
          </p>
        )}

        {/* Le motif de repli de `TalentDiff` : un résumé d'une ligne, le détail derrière.
            Le compte est celui de `buildFindings().matching`, à la même définition près —
            les deux phrases s'affichent à quelques centimètres l'une de l'autre. */}
        {matching > 0 && (
          <details className="mt-3">
            <summary className="text-2xs text-dim cursor-pointer font-sans">
              <span className="font-mono">{matching}</span> abilit
              {matching === 1 ? 'y matches' : 'ies match'} the references
            </summary>
            <div className="mt-2 flex flex-col gap-3">
              {matchingCasts.length > 0 && (
                <GroupedAbilities groups={groupCasts(matchingCasts)} unit="/min" />
              )}
              {matchingUptimes.length > 0 && (
                <GroupedAbilities groups={groupUptimes(matchingUptimes, castNames)} unit="%" />
              )}
            </div>
          </details>
        )}
      </Card>

      {shownUptimes.length > 0 && (
        <Card header="Uptime">
          <GroupedAbilities
            groups={groupUptimes(shownUptimes, castNames)}
            unit="%"
            fullWidth={foldMatching}
          />
        </Card>
      )}
    </div>
  );
}

export function RotationCards({
  character,
  topPlayers,
  characterDamage,
  foldMatching,
}: RotationCardsProps) {
  const casts = compareCasts(character, topPlayers, characterDamage);
  const uptimes = compareUptimes(character, topPlayers).filter((row) => row.mine > 0);

  return (
    <RotationComparisonCards
      casts={casts}
      uptimes={uptimes}
      showEmptyReferenceNote={topPlayers.length === 0}
      // Sans référence, il n'y a pas de fourchette : tout serait « hors bande » et le repli
      // n'aurait rien à replier — mais le dire ici évite de le déduire du comportement.
      foldMatching={foldMatching && topPlayers.length > 0}
    />
  );
}
