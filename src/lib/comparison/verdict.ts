import type { BossResult } from '@/types';
import { earlyDeathPctOf, ilvlGapOf, killTimeGapPctOf } from './comparability-gaps';
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
  /**
   * Part du combat que le sujet a jouée avant de mourir, en pourcents, et seulement quand
   * elle est assez basse pour que la comparaison en souffre. `null` le reste du temps.
   *
   * Le fait est ici et non recopié dans le composant, pour la même raison qu'`allEligible` :
   * il se déduit de deux champs que le bandeau n'a pas à rapprocher lui-même. Il ne change
   * ni `kind` ni le niveau de comparabilité — le niveau mesure la distance de la cohorte,
   * celui-ci l'amputation du sujet, et confondre les deux rendrait le bandeau illisible.
   */
  earlyDeathPct: number | null;
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
    earlyDeathPct: earlyDeathPctOf(result.character.context, result.comparability.myKillTimeMs),
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

/**
 * La bannière du verdict cite-t-elle l'ilvl du sujet ?
 *
 * `VerdictBanner` le fait à deux endroits — le motif de disqualification en cas
 * `unreliable`, la ligne de provenance sinon — et jamais quand la source d'ilvl se tait
 * ou qu'il n'y a rien à comparer. Le fait tient ici, à côté des champs qu'il lit, parce
 * qu'un second lecteur en dépend : `BossContentPanel` n'affiche l'ilvl dans `DpsBanner`
 * que lorsque la réponse est non, faute de quoi le même chiffre se lit deux fois dans le
 * même bloc. Recopier la condition dans le panneau la laisserait diverger en silence, et
 * la divergence est muette dans les deux sens : ilvl en double, ou ilvl nulle part.
 */
export function verdictNamesIlvl(verdict: Verdict): boolean {
  if (verdict.ilvlGap === null) return false;
  if (verdict.kind === 'none') return false;
  if (verdict.kind === 'unreliable') return true;
  return verdict.referenceCount > 0;
}
