import type { CastEntry, DamageEntry, RotationSummary, TopPlayer } from '@/types';

export interface AbilityComparison {
  name: string;
  mine: number;
  referenceMin: number | null;
  referenceMax: number | null;
  referenceMedian: number | null;
  deviationPct: number | null;
  referenceTotal: number;
  /**
   * Part des dégâts que porte ce sort, entre 0 et 1, et `null` quand aucune table de dégâts
   * n'a été fournie. C'est le poids du tri — voir {@link compareCasts}.
   */
  damageShare: number | null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function round1(value: number): number {
  // Math.round rounds half-values toward +Infinity, so +37.85 and -37.85 would round
  // asymmetrically. Round by magnitude and reapply the sign so both directions match.
  return (Math.sign(value) * Math.round(Math.abs(value) * 10)) / 10;
}

/**
 * Shared by casts and uptimes: both are "one value of mine against a set of theirs".
 *
 * `weightByName` pondère le tri : voir {@link compareCasts}. Vide, le tri retombe sur la
 * déviation seule.
 */
function compare(
  mineByName: Record<string, number>,
  referencesByName: Record<string, number>[],
  weightByName: Record<string, number> = {}
): AbilityComparison[] {
  const weighted = Object.keys(weightByName).length > 0;
  const names = [
    ...new Set([...Object.keys(mineByName), ...referencesByName.flatMap((r) => Object.keys(r))]),
  ];
  const referenceTotal = referencesByName.length;

  const rows = names.map((name): AbilityComparison => {
    const mine = mineByName[name] ?? 0;
    const damageShare = weighted ? (weightByName[name] ?? 0) : null;

    if (referenceTotal === 0) {
      return {
        name,
        mine,
        referenceMin: null,
        referenceMax: null,
        referenceMedian: null,
        deviationPct: null,
        referenceTotal: 0,
        damageShare,
      };
    }

    const theirs = referencesByName.map((r) => r[name] ?? 0);
    const med = median(theirs);
    // A zero median means no reference meaningfully used this ability — there is nothing to
    // show a range or a deviation against, regardless of what referenceMin/Max compute to.
    const referenceMedian = med === 0 ? null : med;

    return {
      name,
      mine,
      referenceMin: Math.min(...theirs),
      referenceMax: Math.max(...theirs),
      referenceMedian,
      deviationPct:
        referenceMedian === null
          ? null
          : round1(((mine - referenceMedian) / referenceMedian) * 100),
      referenceTotal,
      damageShare,
    };
  });

  const cost = (row: AbilityComparison) => Math.abs(row.deviationPct!) * (row.damageShare ?? 1);

  return rows.sort((a, b) => {
    if (a.deviationPct === null && b.deviationPct === null) return b.mine - a.mine;
    if (a.deviationPct === null) return 1;
    if (b.deviationPct === null) return -1;
    const byCost = cost(b) - cost(a);
    // Deux sorts sans part de dégâts connue — l'utilitaire — pèsent zéro tous les deux. La
    // pondération les range après le reste ; entre eux, c'est la déviation qui tranche.
    return byCost !== 0 ? byCost : Math.abs(b.deviationPct) - Math.abs(a.deviationPct);
  });
}

/**
 * La part des dégâts de chaque sort *lancé*, par nom de cast.
 *
 * La jointure se fait sur le `guid`, avec le nom en repli : un sort et sa ligne de dégâts
 * ne portent pas toujours le même libellé. Un cast sans ligne de dégâts n'entre pas dans le
 * relevé — il pèsera zéro, ce qui est exactement ce qu'un sort utilitaire vaut ici.
 */
function damageShareByCast(
  entries: DamageEntry[],
  casts: Record<string, CastEntry>
): Record<string, number> {
  const total = entries.reduce((sum, e) => sum + e.total, 0);
  if (total === 0) return {};

  const byGuid = new Map<number, number>();
  const byName = new Map<string, number>();
  for (const entry of entries) {
    // Un guid nul est un guid absent, pas un identifiant : le laisser entrer joindrait
    // entre eux tous les sorts qui n'en ont pas.
    if (entry.guid !== 0)
      byGuid.set(entry.guid, (byGuid.get(entry.guid) ?? 0) + entry.total / total);
    byName.set(entry.name, (byName.get(entry.name) ?? 0) + entry.total / total);
  }

  const shares: Record<string, number> = {};
  for (const [name, cast] of Object.entries(casts)) {
    const share = byGuid.get(cast.guid) ?? byName.get(name);
    if (share !== undefined) shares[name] = share;
  }
  return shares;
}

/**
 * Les écarts de rotation, du plus coûteux au moins coûteux.
 *
 * Trier par déviation seule met en tête ce qui *diffère*, pas ce que ça coûte : un
 * dénominateur médian faible suffit à propulser un sort rare et sans conséquence — trois
 * Barkskin contre un, c'est +200 %, et le DPS n'en sait rien. Pondérer la déviation par la
 * part de dégâts du sort répond à la vraie question. Rien n'est masqué pour autant : l'ordre
 * change, la liste reste entière.
 *
 * La part retenue est la plus forte des deux côtés. Un sort que les références tirent à 12 %
 * de leurs dégâts et que je ne lance jamais pèse 12 %, pas zéro — c'est précisément le cas
 * qu'une pondération sur mes seuls dégâts enterrerait, alors qu'il est l'information forte.
 *
 * Sans `characterDamage` ni table côté références, le tri retombe sur la déviation seule.
 */
export function compareCasts(
  character: RotationSummary,
  topPlayers: TopPlayer[],
  characterDamage: DamageEntry[] = []
): AbilityComparison[] {
  const toPerMin = (casts: RotationSummary['casts']) =>
    Object.fromEntries(Object.entries(casts).map(([name, entry]) => [name, entry.perMin]));

  const shares = [
    damageShareByCast(characterDamage, character.casts),
    ...topPlayers.map((p) => damageShareByCast(p.damageTable.entries, p.rotation.casts)),
  ];

  const weights: Record<string, number> = {};
  for (const side of shares) {
    for (const [name, share] of Object.entries(side)) {
      weights[name] = Math.max(weights[name] ?? 0, share);
    }
  }

  return compare(
    toPerMin(character.casts),
    topPlayers.map((p) => toPerMin(p.rotation.casts)),
    weights
  );
}

export function compareUptimes(
  character: RotationSummary,
  topPlayers: TopPlayer[]
): AbilityComparison[] {
  return compare(
    character.buffs,
    topPlayers.map((p) => p.rotation.buffs)
  );
}
