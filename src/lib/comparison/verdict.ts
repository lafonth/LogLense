import type { BossResult } from '@/types';
import { ilvlGapOf, killTimeGapPctOf } from './comparability-gaps';
import { usableSample } from './stat-distribution';

/**
 * La conclusion que l'analyse produit déjà, ramenée à une phrase.
 *
 * Rien n'est calculé ici qui ne le soit ailleurs : le DPS des références sort de
 * `sample`, l'écart d'ilvl de `comparability`. Le module n'existe que pour trancher
 * **laquelle des quatre phrases** l'écran a le droit de dire, parce que ce choix est le
 * seul endroit où un écart chiffré peut être annoncé alors que la comparaison ne le
 * porte pas.
 *
 * La règle qui commande tout : un écart n'est énoncé que si le panel est légitime. Un
 * repli — `poor`, ou des références repêchées — se dit, il ne se chiffre pas. C'est la
 * même leçon que `ComparabilityBanner` applique un cran plus bas dans l'écran, sauf
 * qu'ici elle décide de l'existence du chiffre, pas de sa couleur.
 */
export type VerdictKind =
  /** Les références sont devant : l'écart est la marge du joueur. */
  | 'gap'
  /** Le joueur est devant : la marge n'est pas dans les dégâts bruts. */
  | 'ahead'
  /** Panel complété ou trop lointain : aucun écart chiffré n'est annoncé. */
  | 'unreliable'
  /** Aucune référence : il n'y a rien à comparer. */
  | 'none';

export interface Verdict {
  kind: VerdictKind;
  /** DPS médian des références utilisables ; `null` quand il n'y en a aucune. */
  referenceDps: number | null;
  myDps: number;
  /** Valeur absolue de l'écart — `kind` porte le sens. `null` hors des cas chiffrés. */
  deltaDps: number | null;
  /** Sur combien de références `referenceDps` est pris. `0` quand il n'y en a aucune. */
  referenceCount: number;
  /** Écart d'ilvl des références au joueur, signé. `null` quand la source se tait. */
  ilvlGap: number | null;
  myIlvl: number;
  /** Écart de durée des kills de référence au mien, signé, en pourcents. */
  killTimeGapPct: number | null;
  /**
   * Vrai quand chaque référence derrière le chiffre a passé les critères éliminatoires :
   * aucune repêchée pour compléter le panel, aucune disqualifiée admise faute de mieux.
   *
   * C'est la seule affirmation de la bannière que la donnée ne porte pas d'elle-même —
   * d'où sa place ici plutôt qu'un `substituted === 0` recopié dans le composant, qui
   * raterait le second cas.
   */
  allEligible: boolean;
  /**
   * Vrai quand la comparabilité est `approximate` : le chiffre tient, mais la phrase
   * doit dire à quel titre.
   */
  approximate: boolean;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Le DPS auquel les références se situent.
 *
 * L'échantillon vérifié d'abord — c'est la population sur laquelle l'écran raisonne
 * partout ailleurs — et les `topPlayers` en repli, pour un résultat ancien ou un chemin
 * qui n'aurait pas rempli `sample`. Les deux sont déjà en mémoire.
 *
 * L'effectif sort d'ici et non de `referenceIlvlCount` : c'est la population de **ce**
 * chiffre-là. Un panel de trois dont une seule porte un ilvl donne trois DPS et une
 * médiane d'ilvl sur une — annoncer le même effectif pour les deux ferait mentir l'un
 * des deux.
 */
function referenceDpsOf(result: BossResult): {
  dps: number | null;
  count: number;
  qualifiedOnly: boolean;
} {
  const { entries, includesDisqualified } = usableSample(result.sample);
  const fromSample = median(entries.map((e) => e.dps));
  if (fromSample !== null) {
    return {
      dps: Math.round(fromSample),
      count: entries.length,
      qualifiedOnly: !includesDisqualified,
    };
  }

  const fromTop = median(result.topPlayers.map((p) => p.stats.dps));
  if (fromTop === null) return { dps: null, count: 0, qualifiedOnly: false };
  return { dps: Math.round(fromTop), count: result.topPlayers.length, qualifiedOnly: true };
}

export function buildVerdict(result: BossResult): Verdict {
  const { level, myIlvl, substituted } = result.comparability;

  const { dps: referenceDps, count: referenceCount, qualifiedOnly } = referenceDpsOf(result);
  const myDps = Math.round(result.character.dps);

  const base = {
    referenceDps,
    referenceCount,
    myDps,
    ilvlGap: ilvlGapOf(result.comparability),
    myIlvl,
    killTimeGapPct: killTimeGapPctOf(result.comparability),
    approximate: level === 'approximate',
    allEligible: substituted === 0 && qualifiedOnly,
  };

  if (referenceDps === null || level === 'none') {
    return { ...base, kind: 'none', deltaDps: null };
  }

  // Un panel complété force déjà `level` à `poor` en amont ; on ne s'appuie pas sur cette
  // implication pour décider de taire un chiffre.
  if (level === 'poor' || substituted > 0) {
    return { ...base, kind: 'unreliable', deltaDps: null };
  }

  const delta = referenceDps - myDps;
  return { ...base, kind: delta > 0 ? 'gap' : 'ahead', deltaDps: Math.abs(delta) };
}
