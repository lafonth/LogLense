import type { BossResult } from '@/types';
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
  /** Écart d'ilvl des références au joueur, signé. `null` quand la source se tait. */
  ilvlGap: number | null;
  myIlvl: number;
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
 */
function referenceDpsOf(result: BossResult): number | null {
  const { entries } = usableSample(result.sample);
  const fromSample = median(entries.map((e) => e.dps));
  if (fromSample !== null) return Math.round(fromSample);

  const fromTop = median(result.topPlayers.map((p) => p.stats.dps));
  return fromTop === null ? null : Math.round(fromTop);
}

export function buildVerdict(result: BossResult): Verdict {
  const { level, referenceIlvl, myIlvl, substituted } = result.comparability;

  const referenceDps = referenceDpsOf(result);
  const myDps = Math.round(result.character.dps);
  const ilvlGap =
    referenceIlvl === null
      ? null
      : Math.sign(referenceIlvl - myIlvl) *
        (Math.round(Math.abs(referenceIlvl - myIlvl) * 10) / 10);

  const base = { referenceDps, myDps, ilvlGap, myIlvl, approximate: level === 'approximate' };

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
