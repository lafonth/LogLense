import type { RotationSummary, TopPlayer } from '@/types';

export interface AbilityComparison {
  name: string;
  mine: number;
  referenceMin: number | null;
  referenceMax: number | null;
  referenceMedian: number | null;
  deviationPct: number | null;
  referenceTotal: number;
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

/** Shared by casts and uptimes: both are "one value of mine against a set of theirs". */
function compare(
  mineByName: Record<string, number>,
  referencesByName: Record<string, number>[]
): AbilityComparison[] {
  const names = [
    ...new Set([...Object.keys(mineByName), ...referencesByName.flatMap((r) => Object.keys(r))]),
  ];
  const referenceTotal = referencesByName.length;

  const rows = names.map((name): AbilityComparison => {
    const mine = mineByName[name] ?? 0;

    if (referenceTotal === 0) {
      return {
        name,
        mine,
        referenceMin: null,
        referenceMax: null,
        referenceMedian: null,
        deviationPct: null,
        referenceTotal: 0,
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
    };
  });

  return rows.sort((a, b) => {
    if (a.deviationPct === null && b.deviationPct === null) return b.mine - a.mine;
    if (a.deviationPct === null) return 1;
    if (b.deviationPct === null) return -1;
    return Math.abs(b.deviationPct) - Math.abs(a.deviationPct);
  });
}

export function compareCasts(
  character: RotationSummary,
  topPlayers: TopPlayer[]
): AbilityComparison[] {
  const toPerMin = (casts: RotationSummary['casts']) =>
    Object.fromEntries(Object.entries(casts).map(([name, entry]) => [name, entry.perMin]));

  return compare(
    toPerMin(character.casts),
    topPlayers.map((p) => toPerMin(p.rotation.casts))
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
