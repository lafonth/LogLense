import type { OpeningCast } from '@/types';

/**
 * Le minimum dont la comparaison d'ouverture a besoin. Volontairement structurel, comme
 * `TalentSource` : `TopPlayer` le satisfait sans qu'on ait à l'importer ici.
 */
export interface OpeningSource {
  rotation: { opening: OpeningCast[] };
}

export interface OpeningStep {
  /** Rang dans la séquence, à partir de 0. */
  index: number;
  /** Ce que j'ai lancé à ce rang, ou `null` si mon ouverture s'arrête avant. */
  mine: string | null;
  /** Le sort majoritaire des références à ce rang, ou `null` si aucune n'y arrive. */
  consensus: string | null;
  /** Combien de références ont lancé ce sort-là à ce rang. */
  consensusCount: number;
  /** Combien de références ont une ouverture exploitable, tous rangs confondus. */
  referenceTotal: number;
  matches: boolean;
}

export interface OpeningDiffResult {
  steps: OpeningStep[];
  referenceTotal: number;
  /**
   * Le premier rang où je m'écarte du consensus — le seul point qui compte vraiment :
   * après lui, la suite de ma séquence n'est plus comparable rang à rang, puisqu'elle a
   * décalé. `null` quand je suis le consensus jusqu'au bout.
   */
  firstDivergence: number | null;
}

/** Le sort le plus lancé à ce rang, ex æquo départagés par ordre d'apparition. */
function majorityAt(openings: OpeningCast[][], index: number): [string, number] | null {
  const counts = new Map<string, number>();
  for (const opening of openings) {
    const cast = opening[index];
    if (cast) counts.set(cast.name, (counts.get(cast.name) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
}

/**
 * Mon ouverture contre celle du champ, rang par rang.
 *
 * Les références sans ouverture sont écartées de l'effectif plutôt que comptées comme des
 * désaccords : un log dont les événements de cast manquent n'est pas un log qui a joué
 * autrement. Quand il n'en reste aucune, le résultat porte mes rangs et un consensus vide —
 * l'écran a de quoi montrer ma séquence en disant qu'il n'a rien à quoi la comparer.
 */
export function diffOpening(mine: OpeningCast[], references: OpeningSource[]): OpeningDiffResult {
  const openings = references.map((r) => r.rotation.opening).filter((o) => o.length > 0);
  const referenceTotal = openings.length;

  const length = Math.max(mine.length, ...openings.map((o) => o.length), 0);
  const steps: OpeningStep[] = [];
  let firstDivergence: number | null = null;

  for (let index = 0; index < length; index++) {
    const mineName = mine[index]?.name ?? null;
    const majority = majorityAt(openings, index);
    const consensus = majority?.[0] ?? null;
    const matches = consensus !== null && mineName === consensus;

    if (firstDivergence === null && consensus !== null && !matches) firstDivergence = index;

    steps.push({
      index,
      mine: mineName,
      consensus,
      consensusCount: majority?.[1] ?? 0,
      referenceTotal,
      matches,
    });
  }

  return { steps, referenceTotal, firstDivergence };
}
