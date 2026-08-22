import type { FightContext } from '@/lib/wcl/fight-context';
import type { Comparability } from '@/types';
import { EARLY_DEATH_TOLERANCE } from '@/lib/wcl/constants';

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
 *
 * `earlyDeathPctOf` fait exception et l'assume : chez elle le fait et le seuil sont une
 * seule lecture — une mort à 94 % du combat n'est pas un petit avertissement, c'en est
 * aucun. Rendre le chiffre puis le comparer ailleurs obligerait chaque appelant à
 * reconstruire le même `< 0,8`.
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

/**
 * Part du combat que le sujet a jouée avant de mourir, en pourcents, **et seulement quand
 * elle est assez basse pour que la comparaison en souffre**.
 *
 * Un joueur mort tôt n'a pas fait moins bien : il a fait moins longtemps. Son total porte
 * sur une fenêtre plus courte que celle des références, et aucun filtre de comparabilité
 * ne rattrape ça — ils comparent des cohortes, pas des durées de survie.
 *
 * Ce chiffre ne sert qu'à dire que la comparaison est difficile à défendre. Il ne dit rien
 * de la mort elle-même, et rien ne doit lui en faire dire : le périmètre du produit est le
 * dégât sortant.
 *
 * Trois silences, pour la même raison — on n'a pas le fait :
 * - `context` à `null`, la requête de contexte ayant échoué en douceur ;
 * - `subjectDeathMs` à `null`, y compris quand `subjectDied` est vrai : l'horodatage n'a
 *   pas été lu, et l'absence n'est pas un zéro ;
 * - une pull de durée nulle, qui n'est pas une pull d'une seconde mais une durée qu'on n'a
 *   pas.
 */
export function earlyDeathPctOf(context: FightContext | null, myKillTimeMs: number): number | null {
  if (context === null || context.subjectDeathMs === null || myKillTimeMs === 0) return null;
  const covered = context.subjectDeathMs / myKillTimeMs;
  if (covered >= 1 - EARLY_DEATH_TOLERANCE) return null;
  return Math.round(covered * 100);
}
