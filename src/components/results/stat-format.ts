import type { StatKey } from '@/lib/comparison/stat-distribution';

/**
 * Le rendu d'une statistique, partagé par les deux tableaux qui en montrent une
 * distribution — `StatsTable` sur l'échantillon complet, `CohortFilterPanel` sur la cohorte
 * refiltrée. Un ilvl à la décimale d'un côté et arrondi de l'autre se lirait comme un écart.
 */
export const STAT_FORMATTERS: Record<StatKey, (v: number) => string> = {
  avgIlvl: (v) => v.toFixed(1),
  primaryStat: (v) => Math.round(v).toLocaleString('en-US'),
  crit: (v) => Math.round(v).toLocaleString('en-US'),
  haste: (v) => Math.round(v).toLocaleString('en-US'),
  mastery: (v) => Math.round(v).toLocaleString('en-US'),
  vers: (v) => Math.round(v).toLocaleString('en-US'),
};
