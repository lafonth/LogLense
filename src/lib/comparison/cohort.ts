import type { StatDistribution } from './stat-distribution';
import type { ComparabilityLevel } from '@/lib/wcl/comparability';
import type { CharacterStats, ReferenceSample } from '@/types';
import { comparabilityLevel, medianOf, selectClosest } from '@/lib/wcl/comparability';
import { describeValues, STAT_AXES } from './stat-distribution';

/**
 * Rejouer la cohorte de référence sur demande, sans une requête de plus.
 *
 * L'instantané porte les douze candidats vérifiés — stats, dps, kill time, verdict de
 * qualification — pour vingt-quatre heures. Tout ce qu'on peut demander à ce vivier
 * (« seulement le 4p », « seulement les kills sous cinq minutes », « inclus les disqualifiés
 * et dis-moi ce que ça change ») se répond en le refiltrant et en rescorant, avec les mêmes
 * fonctions que la sélection d'origine. C'est la seule raison pour laquelle le chat est
 * gratuit : sans `sample`, chacune de ces questions rouvrirait le pipeline.
 *
 * Module pur, sans rendu ni réseau — comme le reste de `comparison/`.
 */

/**
 * Ce qu'on peut demander à la cohorte. Tous les axes sont optionnels ; un filtre vide rend
 * la cohorte telle que la sélection l'a vue.
 */
export interface CohortFilter {
  /** Nombre exact de pièces de tier. Un candidat sans équipement lu (`null`) ne passe pas. */
  tierPieces?: number;
  /** Bornes de durée de combat, en millisecondes. */
  minKillTimeMs?: number;
  maxKillTimeMs?: number;
  /** Écart d'ilvl toléré autour du sujet, en points. */
  ilvlWithin?: number;
  /** Plafond de temps sous buff offensif reçu, en points de durée. */
  maxExternalUptime?: number;
  /** Faux par défaut : les disqualifiés restent dehors tant qu'on ne les demande pas. */
  includeDisqualified?: boolean;
}

/** Le sujet, réduit à ce dont la resélection a besoin. */
export interface CohortSubject {
  stats: CharacterStats;
  dps: number;
  killTimeMs: number;
}

/**
 * Le pointeur qui identifie un log partout où il apparaît : `ReferenceSample`,
 * `ReferenceProvenance` et les membres d'une cohorte le portent tous les trois. C'est ce qui
 * permet à un écran de dire qu'une case cochée et une référence détaillée désignent le même
 * combat — le nom seul ne le prouve pas.
 */
export function logKey(ref: { code: string; fightID: number; actorId: number }): string {
  return `${ref.code}:${ref.fightID}:${ref.actorId}`;
}

/** Un membre de la cohorte retenue, à plat : ce que le chat a le droit de nommer. */
export interface CohortMember {
  name: string;
  /**
   * Le log désigné, pour que l'appelant retrouve le `ReferenceSample` derrière une ligne.
   * Le chat n'en voit rien : `chat-tools` recopie les membres champ par champ, et un
   * pointeur de log ne lui servirait qu'à consommer des jetons.
   */
  code: string;
  fightID: number;
  actorId: number;
  dps: number;
  killTimeMs: number;
  avgIlvl: number;
  tierPieces: number | null;
  externalUptime: number;
  qualified: boolean;
  /** Distance au sujet, avec le même score que la sélection d'origine. */
  distance: number;
}

export interface CohortView {
  filter: CohortFilter;
  /** Effectif retenu, et ce que le filtre a écarté du vivier complet. */
  size: number;
  excluded: number;
  /**
   * Le niveau de comparabilité **de cette cohorte-là**, recalculé. C'est la réponse à
   * « qu'est-ce que ça change » : un filtre qui resserre l'ilvl peut faire passer un panel
   * de `approximate` à `close`, ou vider la cohorte et rendre `none`.
   */
  level: ComparabilityLevel;
  medianDistance: number | null;
  stats: StatDistribution[];
  dps: ReturnType<typeof describeValues>;
  killTimeMs: ReturnType<typeof describeValues>;
  members: CohortMember[];
}

/**
 * Le vivier réduit au filtre demandé.
 *
 * `tierPieces` à `null` veut dire « équipement non lu », pas « zéro pièce » : un filtre sur
 * le tier l'écarte plutôt que de le compter à zéro, sinon un défaut de collecte se lirait
 * comme une observation.
 */
export function applyCohortFilter(
  sample: ReferenceSample[],
  filter: CohortFilter,
  subjectIlvl: number
): ReferenceSample[] {
  return sample.filter((entry) => {
    if (!entry.qualified && !filter.includeDisqualified) return false;
    if (filter.tierPieces !== undefined && entry.tierPieces !== filter.tierPieces) return false;
    if (filter.minKillTimeMs !== undefined && entry.killTimeMs < filter.minKillTimeMs) return false;
    if (filter.maxKillTimeMs !== undefined && entry.killTimeMs > filter.maxKillTimeMs) return false;
    if (filter.maxExternalUptime !== undefined && entry.externalUptime > filter.maxExternalUptime)
      return false;
    if (filter.ilvlWithin !== undefined) {
      if (subjectIlvl <= 0) return false;
      if (Math.abs(entry.stats.avgIlvl - subjectIlvl) > filter.ilvlWithin) return false;
    }
    return true;
  });
}

/**
 * La cohorte filtrée, décrite : effectif, niveau de comparabilité recalculé, distributions
 * de stats, de dps et de kill time, et la liste des membres du plus proche au plus lointain.
 *
 * Les distributions sont calculées **directement sur les retenus**, pas via `usableSample` :
 * celui-ci rouvre la cohorte aux disqualifiés quand plus rien ne qualifie, ce qui est le bon
 * repli pour un panel choisi automatiquement mais l'inverse de ce qu'on veut ici — une
 * demande explicite qui ne retient personne doit rendre une cohorte vide, et le dire.
 */
export function describeCohort(
  subject: CohortSubject,
  sample: ReferenceSample[],
  filter: CohortFilter = {}
): CohortView {
  const entries = applyCohortFilter(sample, filter, subject.stats.avgIlvl);

  const scored = selectClosest(
    entries.map((entry) => ({
      entry,
      bracketData: entry.stats.avgIlvl,
      duration: entry.killTimeMs,
    })),
    subject.stats.avgIlvl,
    subject.killTimeMs,
    entries.length
  );

  const members: CohortMember[] = scored.map(({ candidate, distance }) => ({
    name: candidate.entry.name,
    code: candidate.entry.code,
    fightID: candidate.entry.fightID,
    actorId: candidate.entry.actorId,
    dps: candidate.entry.dps,
    killTimeMs: candidate.entry.killTimeMs,
    avgIlvl: candidate.entry.stats.avgIlvl,
    tierPieces: candidate.entry.tierPieces,
    externalUptime: candidate.entry.externalUptime,
    qualified: candidate.entry.qualified,
    distance,
  }));

  const stats: StatDistribution[] = STAT_AXES.flatMap(({ key, label }) => {
    const described = describeValues(
      subject.stats[key],
      entries.map((entry) => entry.stats[key])
    );
    return described ? [{ key, label, ...described }] : [];
  });

  return {
    filter,
    size: entries.length,
    excluded: sample.length - entries.length,
    level: comparabilityLevel(scored),
    medianDistance: medianOf(scored.map((s) => s.distance)),
    stats,
    dps: describeValues(
      subject.dps,
      entries.map((entry) => entry.dps)
    ),
    killTimeMs: describeValues(
      subject.killTimeMs,
      entries.map((entry) => entry.killTimeMs)
    ),
    members,
  };
}
