import type { CharacterStats, ReferenceSample } from '@/types';

export type StatKey = 'avgIlvl' | 'primaryStat' | 'crit' | 'haste' | 'mastery' | 'vers';

export const STAT_AXES: { key: StatKey; label: string }[] = [
  { key: 'avgIlvl', label: 'Avg ilvl' },
  { key: 'primaryStat', label: 'Primary Stat' },
  { key: 'crit', label: 'Crit' },
  { key: 'haste', label: 'Haste' },
  { key: 'mastery', label: 'Mastery' },
  { key: 'vers', label: 'Versatility' },
];

export interface ValueDistribution {
  mine: number;
  min: number;
  median: number;
  max: number;
  /** Position de `mine` dans l'échantillon, de 0 à 100. Voir `percentileOf`. */
  percentile: number;
  sampleSize: number;
}

export interface StatDistribution extends ValueDistribution {
  key: StatKey;
  label: string;
}

export interface StatDistributionResult {
  stats: StatDistribution[];
  sampleSize: number;
  /**
   * Vrai quand aucun candidat n'a qualifié et que la distribution retombe sur l'échantillon
   * entier — même repli que le panel, et il doit se dire de la même façon.
   */
  includesDisqualified: boolean;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Rang moyen : les ex æquo comptent pour moitié, si bien qu'une valeur au centre exact
 * d'un échantillon symétrique donne 50 quel que soit le nombre d'égalités.
 */
function percentileOf(mine: number, values: number[]): number {
  const below = values.filter((v) => v < mine).length;
  const tied = values.filter((v) => v === mine).length;
  return Math.round(((below + tied / 2) / values.length) * 100);
}

export function describeValues(mine: number, values: number[]): ValueDistribution | null {
  if (values.length === 0) return null;
  return {
    mine,
    min: Math.min(...values),
    median: median(values),
    max: Math.max(...values),
    percentile: percentileOf(mine, values),
    sampleSize: values.length,
  };
}

/**
 * L'échantillon sur lequel raisonner : les candidats qualifiés, ou l'échantillon entier
 * quand aucun ne l'est. Un candidat écarté l'a été parce qu'il a été *plus aidé* que le
 * joueur — le garder dans la distribution la tirerait vers le haut sans que le jeu y soit
 * pour quelque chose. On ne l'admet que faute de mieux, et jamais en silence.
 */
export function usableSample(sample: ReferenceSample[]): {
  entries: ReferenceSample[];
  includesDisqualified: boolean;
} {
  const qualified = sample.filter((s) => s.qualified);
  if (qualified.length > 0) return { entries: qualified, includesDisqualified: false };
  return { entries: sample, includesDisqualified: sample.length > 0 };
}

export function describeStats(
  mine: CharacterStats,
  sample: ReferenceSample[]
): StatDistributionResult {
  const { entries, includesDisqualified } = usableSample(sample);

  const stats = STAT_AXES.flatMap(({ key, label }) => {
    const dist = describeValues(
      mine[key],
      entries.map((e) => e.stats[key])
    );
    return dist ? [{ key, label, ...dist }] : [];
  });

  return { stats, sampleSize: entries.length, includesDisqualified };
}
