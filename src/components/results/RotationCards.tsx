import type { AbilityGroup } from '@/lib/comparison/ability-groups';
import type { AbilityComparison } from '@/lib/comparison/rotation-stats';
import type { IconIndex } from '@/lib/wcl/icons';
import type { DamageEntry, RotationSummary, TopPlayer } from '@/types';
import { Card } from '@/components/ui/Card';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { SpellIcon } from '@/components/ui/SpellIcon';
import { groupCasts, groupUptimes } from '@/lib/comparison/ability-groups';
import { compareCasts, compareUptimes, inReferenceBand } from '@/lib/comparison/rotation-stats';
import { mergeIcons } from '@/lib/wcl/icons';

interface RotationCardsProps {
  character: RotationSummary;
  topPlayers: TopPlayer[];
  /** Ce qui pondère le tri des casts : sans elle, l'ordre retombe sur la déviation seule. */
  characterDamage: DamageEntry[];
  /** Voir {@link RotationComparisonCardsProps.foldMatching}. */
  foldMatching?: boolean;
}

/** Les mêmes classes que `AbilityTable` : les deux tables se lisent l'une sous l'autre. */
const CELL = 'border-border font-mono text-xs border-b px-3 py-2 text-right whitespace-nowrap';
const HEADER_CELL = `${CELL} text-muted text-2xs tracking-wider uppercase`;

function formatDeviation(pct: number): string {
  // U+2212 minus sign, not a hyphen — it aligns with digits in a monospace face.
  const sign = pct < 0 ? '−' : '+';
  return `${sign}${Math.abs(pct).toFixed(1)} %`;
}

/**
 * La couleur de l'écart dit **le côté**, jamais la faute.
 *
 * En dessous de la médiane, `text-deviation` — la couleur d'écart du produit. Au-dessus,
 * `text-brass-bright`. Le rouge reste réservé aux erreurs : caster plus que le champ n'est pas
 * une réussite en soi (sur-caster un sort se paie sur un autre), donc un couple vert / rouge
 * affirmerait un jugement que la donnée ne porte pas.
 */
function deviationClass(pct: number): string {
  return pct < 0 ? 'text-deviation' : 'text-brass-bright';
}

/** Un tiret cadratin, et non une case vide : l'absence de donnée doit se voir dans la colonne. */
const MISSING = '—';

function AbilityRows({
  rows,
  unit,
  icons,
  showShare,
  showReferences,
}: {
  rows: AbilityComparison[];
  unit: string;
  icons?: IconIndex;
  showShare: boolean;
  showReferences: boolean;
}) {
  return (
    <ScrollArea label={`Your rotation against the references, in ${unit}`}>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={`${HEADER_CELL} text-left`}>Ability</th>
            {/* La part de dégâts est ce qui pilote le tri : elle reste une colonne, et non un
                appendice du nom, pour que l'ordre se vérifie en descendant les chiffres. */}
            {showShare && <th className={HEADER_CELL}>% dmg</th>}
            <th className={HEADER_CELL}>You {unit}</th>
            {showReferences && <th className={HEADER_CELL}>Median</th>}
            {showReferences && <th className={HEADER_CELL}>References</th>}
            {showReferences && <th className={HEADER_CELL}>Deviation</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td className={`${CELL} text-left`}>
                <span className="text-muted flex min-w-0 items-center gap-1.5">
                  <SpellIcon name={row.name} icon={icons?.[row.name]} />
                  <span className="text-text truncate font-sans">{row.name}</span>
                </span>
              </td>
              {showShare && (
                <td className={CELL}>
                  {row.damageShare !== null && row.damageShare > 0
                    ? `${(row.damageShare * 100).toFixed(1)} %`
                    : MISSING}
                </td>
              )}
              <td className={`${CELL} text-text`}>{row.mine.toFixed(2)}</td>
              {showReferences && (
                <td className={CELL}>
                  {row.referenceMedian === null ? MISSING : row.referenceMedian.toFixed(2)}
                </td>
              )}
              {showReferences && (
                <td className={`${CELL} text-dim`}>
                  {row.referenceMedian === null
                    ? MISSING
                    : `${row.referenceMin!.toFixed(2)} – ${row.referenceMax!.toFixed(2)}`}
                </td>
              )}
              {showReferences && (
                <td
                  className={`${CELL} ${
                    row.deviationPct === null ? 'text-dim' : deviationClass(row.deviationPct)
                  }`}
                >
                  {row.deviationPct === null ? MISSING : formatDeviation(row.deviationPct)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  );
}

/** Les blocs d'une carte. La grille reste *à l'intérieur* d'un groupe : sur deux colonnes,
 *  une grille partagée laisserait la fin d'un groupe et le début du suivant sur la même
 *  ligne, et l'en-tête ne dirait plus de quoi il est le titre. */
function GroupedAbilities({
  groups,
  unit,
  icons,
}: {
  groups: AbilityGroup[];
  unit: string;
  icons?: IconIndex;
}) {
  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-2">
          {group.label !== '' && <h3 className="text-2xs text-muted font-sans">{group.label}</h3>}
          <AbilityRows
            rows={group.rows}
            unit={unit}
            icons={icons}
            // Les colonnes s'abandonnent quand la donnée n'existe pas, comme dans
            // `AbilityTable` : une table de dégâts absente ne laisse pas une colonne de
            // tirets, et un groupe qu'aucune référence n'a joué ne prétend pas à un écart.
            showShare={group.rows.some((row) => (row.damageShare ?? 0) > 0)}
            showReferences={group.rows.some((row) => row.referenceMedian !== null)}
          />
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
  /** L'index du combat. Absent, chaque carte rend sa pastille neutre. */
  icons?: IconIndex;
}

/** La partie présentationnelle : reçoit des comparaisons déjà calculées, n'en calcule aucune.
 *  Séparée de `RotationCards` pour que le mode pull-comparison, dont la référence unique vient
 *  déjà de `comparePulls`, l'utilise sans repasser par `compareCasts`/`compareUptimes`. */
export function RotationComparisonCards({
  casts,
  uptimes,
  showEmptyReferenceNote,
  foldMatching,
  icons,
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
          <GroupedAbilities groups={groupCasts(shownCasts)} unit="/min" icons={icons} />
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
                <GroupedAbilities groups={groupCasts(matchingCasts)} unit="/min" icons={icons} />
              )}
              {matchingUptimes.length > 0 && (
                <GroupedAbilities
                  groups={groupUptimes(matchingUptimes, castNames)}
                  unit="%"
                  icons={icons}
                />
              )}
            </div>
          </details>
        )}
      </Card>

      {shownUptimes.length > 0 && (
        <Card header="Uptime">
          <GroupedAbilities groups={groupUptimes(shownUptimes, castNames)} unit="%" icons={icons} />
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

  // `compare*` unionne mes noms et ceux des références : une ligne peut n'exister que chez
  // elles, et serait alors la seule à rester en pastille neutre — à l'écran, un repli qui ne
  // frappe qu'une catégorie de lignes se lit comme une image cassée, pas comme une intention.
  // Le mien passe en dernier : à nom égal, c'est l'icône de mon propre combat qui gagne.
  const icons = mergeIcons(...topPlayers.map((player) => player.rotation.icons), character.icons);

  return (
    <RotationComparisonCards
      casts={casts}
      uptimes={uptimes}
      showEmptyReferenceNote={topPlayers.length === 0}
      icons={icons}
      // Sans référence, il n'y a pas de fourchette : tout serait « hors bande » et le repli
      // n'aurait rien à replier — mais le dire ici évite de le déduire du comportement.
      foldMatching={foldMatching && topPlayers.length > 0}
    />
  );
}
