import type { AbilityComparison } from './rotation-stats';
import type { TalentDiffResult, TalentSource } from './talent-diff';
import type { DisqualificationReason, EligibilityProfile } from '@/lib/wcl/eligibility';
import type { FightContext } from '@/lib/wcl/fight-context';
import type { CharacterStats, DamageEntry, RotationSummary, TopPlayer } from '@/types';
import { getTalentNodes } from '@/lib/talent-loader';
import { disqualify } from '@/lib/wcl/eligibility';
import { fmtMs } from '@/lib/wcl/parsers';
import { compareCasts, compareUptimes } from './rotation-stats';
import { diffTalents } from './talent-diff';
import { DPS_PER_ILVL, KILL_TIME_ELASTICITY } from './trend';

/**
 * Une pull telle que `fetchFightData` la rend, augmentée du pointeur qui l'identifie et du
 * nom sous lequel elle a été jouée — les deux absents de `FightData` parce que l'appelant
 * les connaît déjà avant de fetcher.
 */
export interface PullSnapshot {
  code: string;
  fightId: number;
  actorId: number;
  name: string;
  fightMs: number;
  stats: CharacterStats;
  rotation: RotationSummary;
  damageEntries: DamageEntry[];
  dps: number;
  eligibility: EligibilityProfile;
  context: FightContext | null;
}

/**
 * L'écart de DPS entre deux pulls du même personnage, décomposé.
 *
 * Même principe que `decomposeStep` dans `trend.ts`, mais sur deux pulls isolées plutôt
 * qu'une trajectoire : pas de `bracket` ni de `rankPercent` disponibles ici puisque spec 04
 * ne récupère aucun classement. La part matériel se lit donc sur l'écart d'`avgIlvl` brut —
 * toujours présent, jamais `null` — et il n'y a pas de `percentileDelta` à rendre.
 */
export interface PullDelta {
  dpsDelta: number;
  /** Part attribuée au matériel. Hypothèse, voir `DPS_PER_ILVL`. */
  ilvlPart: number;
  /** Part attribuée à un combat plus court. Hypothèse, voir `KILL_TIME_ELASTICITY`. */
  killTimePart: number;
  /** Ce qui reste une fois les deux retirés : la seule part qui parle du joueur. */
  remainder: number;
}

export function decomposePullDelta(before: PullSnapshot, after: PullSnapshot): PullDelta {
  const dpsDelta = after.dps - before.dps;
  const ilvlPart = (after.stats.avgIlvl - before.stats.avgIlvl) * DPS_PER_ILVL * before.dps;
  const killTimePart =
    before.fightMs > 0 && after.fightMs > 0
      ? -((after.fightMs - before.fightMs) / before.fightMs) * KILL_TIME_ELASTICITY * before.dps
      : 0;

  // `+ 0` ramène le -0 de `Math.round` à 0 : un écart nul se lit « 0 », pas « -0 ».
  const round = (v: number) => Math.round(v) + 0;

  return {
    dpsDelta: round(dpsDelta),
    ilvlPart: round(ilvlPart),
    killTimePart: round(killTimePart),
    remainder: round(dpsDelta - ilvlPart - killTimePart),
  };
}

/**
 * Une pull mise en forme de référence unique, pour appeler `compareCasts`/`compareUptimes`
 * sans y toucher : « une distribution à un élément reste une distribution » (spec 04 §3).
 */
function asTopPlayer(pull: PullSnapshot): TopPlayer {
  return {
    stats: { ...pull.stats, dps: pull.dps, killTime: fmtMs(pull.fightMs) },
    rotation: pull.rotation,
    damageTable: { entries: pull.damageEntries },
    // Le chemin des pulls ne récupère pas de répartition par cible : `PullSnapshot` n'en
    // porte pas. Un tableau vide dit « pas de cibles connues », ce qu'il faut dire ici.
    fightTargets: [],
    provenance: {
      code: pull.code,
      fightID: pull.fightId,
      actorId: pull.actorId,
      name: pull.name,
      ilvl: pull.stats.avgIlvl,
      killTimeMs: pull.fightMs,
      dps: pull.dps,
      distance: 0,
      disqualifiedBy: [],
      tierPieces: pull.eligibility.tierPieces,
      externalUptime: pull.eligibility.externalUptime,
      explored: false,
    },
  };
}

function asTalentSource(pull: PullSnapshot): TalentSource {
  return { stats: { talents: pull.stats.talents } };
}

export interface PullComparison {
  delta: PullDelta;
  rotation: AbilityComparison[];
  uptimes: AbilityComparison[];
  talents: TalentDiffResult;
  /** Raisons pour lesquelles `after` a reçu plus de tier/externals que `before`. */
  disqualifiedAfter: DisqualificationReason[];
  /** Raisons pour lesquelles `before` a reçu plus de tier/externals que `after`. */
  disqualifiedBefore: DisqualificationReason[];
}

/**
 * Compare deux pulls du même personnage : `after` est jugé contre `before` pris comme
 * référence unique, dans le même sens que « qu'est-ce qui a changé depuis la dernière
 * pull ». Aucune référence externe, aucun classement — tout part des deux `FightData` déjà
 * en mémoire (spec 04 §3).
 */
export function comparePulls(
  before: PullSnapshot,
  after: PullSnapshot,
  specId: number
): PullComparison {
  const nodes = getTalentNodes(specId);
  const reference = [asTopPlayer(before)];

  return {
    delta: decomposePullDelta(before, after),
    rotation: compareCasts(after.rotation, reference, after.damageEntries),
    uptimes: compareUptimes(after.rotation, reference),
    talents: diffTalents(nodes, after.stats.talents, [asTalentSource(before)]),
    disqualifiedAfter: disqualify(after.eligibility, before.eligibility),
    disqualifiedBefore: disqualify(before.eligibility, after.eligibility),
  };
}
