import type { Comparability } from '@/types';

/**
 * Les deux écarts que la comparabilité porte, arrondis comme l'écran les lit.
 *
 * Ils étaient calculés deux fois — `buildVerdict` pour l'ilvl, `ComparabilityBanner` pour
 * l'ilvl et le kill time — avec le même arrondi recopié. Deux copies d'un arrondi, c'est
 * deux chiffres qui peuvent finir par ne plus dire la même chose sur le même panel, dans
 * deux endroits de l'écran que le lecteur voit ensemble.
 *
 * Rien n'est décidé ici : ces fonctions ne disent pas si l'écart a le droit d'être
 * affiché, seulement combien il vaut. Le droit de le dire reste dans `verdict.ts`.
 */

/** Arrondi au dixième qui préserve le signe, y compris sur un zéro négatif. */
function round1(value: number): number {
  return Math.sign(value) * (Math.round(Math.abs(value) * 10) / 10);
}

/** Écart d'ilvl des références au joueur, signé. `null` quand la médiane se tait. */
export function ilvlGapOf({ referenceIlvl, myIlvl }: Comparability): number | null {
  return referenceIlvl === null ? null : round1(referenceIlvl - myIlvl);
}

/**
 * Écart de durée des kills de référence au mien, signé, en pourcents de ma durée.
 *
 * `null` quand la médiane se tait, et quand ma pull ne dure rien — une durée nulle n'est
 * pas une pull de zéro seconde, c'est une durée qu'on n'a pas.
 */
export function killTimeGapPctOf({
  referenceKillTimeMs,
  myKillTimeMs,
}: Comparability): number | null {
  if (referenceKillTimeMs === null || myKillTimeMs === 0) return null;
  return round1(((referenceKillTimeMs - myKillTimeMs) / myKillTimeMs) * 100);
}
