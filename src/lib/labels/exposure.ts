import type { DisqualificationReason } from '@/lib/wcl/eligibility';
import type { BossResult, Comparability } from '@/types';

/**
 * L'enregistrement d'exposition : ce que l'écran a montré, au moment où il l'a montré.
 *
 * C'est la classe positive que le corpus n'a jamais vue. Les verdicts « pas comparable »
 * ne capturent que le refus ; sans trace de ce qui a été montré et non refusé, un modèle
 * n'apprend que sur des négatifs.
 *
 * Ce qu'un consommateur a le droit d'en déduire, et rien d'autre : une référence
 * `contestable` non citée par un verdict portant le même `renderId` est un positif faible.
 * Toute autre lecture est une invention — une entrée non contestable n'a jamais eu de
 * bouton, son silence ne dit rien.
 *
 * Rien ici ne vient du navigateur : l'écriture est serveur, donc pas de `parse*`.
 */

/** Quelle mesure `character.dps` désigne. Les deux chemins ne mesurent pas la même chose. */
export type SubjectDpsSource = 'ranking' | 'damage-table';

export interface ExposedReference {
  code: string;
  fightID: number;
  actorId: number;
  /** Rang dans le panel, 1-indexé ; `null` pour une entrée de la fenêtre hors panel. */
  rank: number | null;
  /**
   * Vraie pour les seules références que l'écran permettait de contester. Un « montrée,
   * non contestée » lu sur une entrée non contestable est un positif fabriqué.
   */
  contestable: boolean;
  qualified: boolean;
  disqualifiedBy: DisqualificationReason[];
  /** Distance de sélection ; `null` quand elle n'a pas pu être calculée. */
  distance: number | null;
}

export interface ExposureRecord {
  v: 3;
  kind: 'exposure';
  at: string;
  /** SHA-256 salé, ou `null` pour un rendu non authentifié. Jamais l'e-mail. */
  by: string | null;
  renderId: string;
  encounterId: number;
  difficulty: number;
  specId: number;
  subject: { code: string; fightID: number; actorId: number; dpsSource: SubjectDpsSource };
  references: ExposedReference[];
  /** L'instantané 10d : le vivier et le verdict du jour ne se reconstituent pas. */
  comparability: Comparability;
}

export interface ExposureArgs {
  by: string | null;
  at: string;
  dpsSource: SubjectDpsSource;
}

/** Le pointeur d'un combat, sans son acteur : ce qui identifie une entrée du panel. */
function fightKey(code: string, fightID: number): string {
  return `${code}:${fightID}`;
}

/**
 * `Infinity` est une distance non calculable, pas une distance immense. `JSON.stringify`
 * la rendrait `null` de son propre chef — autant le dire ici, où c'est une décision.
 */
function finiteOrNull(distance: number | undefined): number | null {
  return distance === undefined || !Number.isFinite(distance) ? null : distance;
}

/**
 * L'enregistrement de ce qui a été montré pour un boss.
 *
 * La fenêtre vérifiée entière est écrite, pas seulement le panel : une référence écartée
 * de l'affichage a quand même été jugée, et ce jugement est de l'information. Le panel s'y
 * distingue par `contestable`, seul endroit où l'écran offrait un bouton.
 */
export function buildExposure(result: BossResult, args: ExposureArgs): ExposureRecord {
  const panel = new Map(
    result.topPlayers.map((p, i) => [
      fightKey(p.provenance.code, p.provenance.fightID),
      { rank: i + 1, provenance: p.provenance },
    ])
  );

  const references: ExposedReference[] = result.sample.map((entry) => {
    const shown = panel.get(fightKey(entry.code, entry.fightID));
    return {
      code: entry.code,
      fightID: entry.fightID,
      actorId: entry.actorId,
      rank: shown ? shown.rank : null,
      contestable: shown !== undefined,
      qualified: entry.qualified,
      disqualifiedBy: shown ? [...shown.provenance.disqualifiedBy] : [],
      distance: finiteOrNull(shown?.provenance.distance),
    };
  });

  return {
    v: 3,
    kind: 'exposure',
    at: args.at,
    by: args.by,
    renderId: result.renderId,
    encounterId: result.encounterId,
    difficulty: result.difficulty,
    specId: result.specId,
    subject: {
      code: result.character.source.code,
      fightID: result.character.source.fightID,
      actorId: result.character.source.actorId,
      dpsSource: args.dpsSource,
    },
    references,
    comparability: { ...result.comparability },
  };
}

/** Clé du mois. Une liste par mois : bornée, et lisible sans index. */
export function exposureMonthKey(iso: string): string {
  return `labels:exposure:${iso.slice(0, 7)}`;
}
