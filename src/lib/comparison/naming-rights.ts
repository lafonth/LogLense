import type { AbilityComparison } from './rotation-stats';
import { inReferenceBand } from './rotation-stats';

/**
 * L'écart minimal, **en lancers**, pour qu'on nomme un sort.
 *
 * Le raisonnement d'origine est bon — « sur trois minutes, un sort lancé une fois de plus
 * suffit à produire quelques pourcents » — mais il porte sur des comptes, pas sur des
 * pourcentages, et un seuil en pourcentage l'inverse : à 0,7 contre 1,0 lancer par minute,
 * un seul cast d'écart fait +43 % et passerait, tandis qu'à 40 contre 44 douze casts
 * d'écart ne font que +10 % et seraient réduits au silence. Le seuil doit donc vivre dans
 * l'unité de son propre argument.
 *
 * Deux, parce que un est exactement le cas que l'argument décrit. Ça reste un jugement,
 * mais un jugement sur une quantité que le lecteur peut compter dans son propre log.
 */
const MIN_CAST_DELTA = 2;

/**
 * Nommer *le* sort où l'écart se lit est un superlatif sur une distribution. Avec une
 * seule référence il n'y a pas de distribution : `referenceMin`, `referenceMax` et la
 * médiane sont le même point, et rien ne permet de distinguer un vrai écart de la
 * particularité d'un joueur.
 *
 * Ce n'est pas le masquage refusé pour `referenceIlvl`, qui est une valeur que la donnée
 * porte vraiment et qu'on affiche avec son effectif. Ici la donnée ne porte pas la
 * comparaison qu'on lui ferait dire.
 */
export const MIN_REFERENCES = 2;

/**
 * A-t-on le droit de nommer ce sort comme cause d'un écart ?
 *
 * Trois conditions, et aucune n'est un seuil de confort :
 *
 * 1. Le panel doit compter au moins {@link MIN_REFERENCES} références. Nommer un sort est un
 *    énoncé sur une distribution ; avec une seule référence il n'y a pas de distribution —
 *    `referenceMin`, `referenceMax` et la médiane sont le même point, et rien ne distingue un
 *    vrai écart de la particularité d'un joueur.
 * 2. Ma cadence doit tomber **hors** de `[referenceMin, referenceMax]`. C'est le plancher
 *    mesuré, celui qu'aucun réglage à la main ne remplace : si les références se dispersent
 *    entre elles plus que je ne m'écarte d'elles, la donnée ne me sépare pas d'elles. Il
 *    s'adapte par sort et par panel, et il est déjà à l'écran — `RotationCards` dessine cette
 *    bande et ce marqueur, donc la règle se relit dans l'onglet.
 * 3. L'écart doit valoir au moins {@link MIN_CAST_DELTA} lancers sur la durée de ma pull.
 *
 * Le prédicat vit dans son propre module parce qu'il a deux appelants qui ne peuvent pas
 * s'importer l'un l'autre : `findings.ts`, qui s'en sert pour décider si une ligne de constat
 * a le droit de **nommer une cause** au lieu de se borner à montrer son écart de dégâts, et
 * `leading-gap.ts`, qui s'en sert pour décider si la bannière parle — et qui lit désormais son
 * sort de tête dans `findings.ts`. Une définition, deux appelants — deux copies finiraient par
 * diverger, et l'écran se contredirait sur le même log.
 */
export function isNameableGap(row: AbilityComparison, fightDurationMs: number): boolean {
  const { mine, referenceMedian, deviationPct } = row;
  if (deviationPct === null || referenceMedian === null) return false;
  // Sans fourchette il n'y a pas de « dehors » : `inReferenceBand` rendrait `false` et
  // laisserait passer un sort qu'aucune référence ne porte.
  if (row.referenceMin === null || row.referenceMax === null) return false;
  if (row.referenceTotal < MIN_REFERENCES) return false;
  if (inReferenceBand(row)) return false;

  const durationMin = fightDurationMs / 60_000;
  return Math.abs(mine - referenceMedian) * durationMin >= MIN_CAST_DELTA;
}
