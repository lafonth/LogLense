import type { ComparabilityLevel } from '@/types';

/**
 * Le vocabulaire du niveau de comparabilité, en un seul endroit.
 *
 * `ComparabilityBanner` énonce le niveau de la sélection réellement utilisée par l'écran ;
 * `CohortFilterPanel` énonce celui d'une cohorte refiltrée à la demande. Deux verdicts
 * différents sur la même échelle : ils doivent employer les mêmes mots, sinon le lecteur
 * lira deux échelles là où il n'y en a qu'une.
 */
export const LEVEL_TONE: Record<ComparabilityLevel, string> = {
  close: 'text-positive',
  approximate: 'text-warning',
  poor: 'text-danger',
  none: 'text-muted',
};

export const LEVEL_LABEL: Record<ComparabilityLevel, string> = {
  close: 'Comparable',
  approximate: 'Roughly comparable',
  poor: 'Not comparable',
  none: 'No comparable logs',
};
