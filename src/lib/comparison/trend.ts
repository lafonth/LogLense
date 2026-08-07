import type { TrajectoryPoint } from '@/lib/wcl/trajectory';

/**
 * Ce que la trajectoire dit — et ce qu'elle ne dit pas.
 *
 * Une courbe de DPS qui monte sur un palier n'est pas une progression : l'ilvl monte pour
 * tout le monde, les kills raccourcissent à mesure que le raid apprend le boss, et les deux
 * poussent le DPS sans que le joueur ait changé quoi que ce soit. Sans décomposition,
 * l'écran est un graphique d'équipement présenté comme un graphique de niveau.
 *
 * Deux lectures, de fiabilité différente, et il faut les tenir séparées :
 *
 * - **Le percentile verrouillé** est déjà normalisé contre la population du moment. Il ne
 *   demande aucun coefficient et c'est le seul axe qui ne dépend d'aucune hypothèse. C'est
 *   lui qui porte le verdict.
 * - **La décomposition du DPS** attribue une part de l'écart à l'ilvl, une part au kill time
 *   et rend le **reste** — la seule part qui parle du joueur. Elle repose sur deux
 *   coefficients déclarés ci-dessous : ce sont des hypothèses, pas des mesures, et l'écran
 *   ne doit pas les présenter autrement.
 *
 * Ces deux coefficients sont exactement ce qu'un modèle entraîné sur le corpus remplacera :
 * ils sont ici en clair, en un seul endroit, pour que le remplacement soit un changement de
 * source et pas une réécriture.
 */

/**
 * Gain de DPS par point d'ilvl, en proportion. 1 % par point : un point d'ilvl ajoute de
 * l'ordre d'un pour cent de statistiques, et le DPS y répond à peu près linéairement sur la
 * plage étroite que couvre une trajectoire de palier.
 */
export const DPS_PER_ILVL = 0.01;

/**
 * Élasticité du DPS à la durée du combat, en valeur absolue. Un combat 10 % plus court rend
 * environ 1,5 % de DPS en plus : les cooldowns couvrent une fraction plus grande du combat,
 * et la fenêtre de burst pèse davantage dans la moyenne.
 */
export const KILL_TIME_ELASTICITY = 0.15;

/** En deçà, une suite de kills ne porte pas de tendance lisible. */
export const MIN_POINTS = 3;

/** Kills récents sur lesquels se lit le verdict. Au-delà, on décrit un autre joueur. */
export const TREND_WINDOW = 6;

/**
 * Pente, en points de percentile par kill, en deçà de laquelle la trajectoire est plate.
 * Un point de percentile par kill sur six kills, c'est six points : en dessous, l'écart ne
 * se distingue pas du bruit d'un soir.
 */
export const PLATEAU_SLOPE = 1;

/** L'écart entre deux kills, et ce qui l'explique. */
export interface TrendStep {
  from: TrajectoryPoint;
  to: TrajectoryPoint;
  dpsDelta: number;
  /** Part attribuée au matériel. Hypothèse, voir `DPS_PER_ILVL`. */
  ilvlPart: number;
  /** Part attribuée à un combat plus court. Hypothèse, voir `KILL_TIME_ELASTICITY`. */
  killTimePart: number;
  /** Ce qui reste une fois les deux retirés : la seule part qui parle du joueur. */
  remainder: number;
  /** L'écart de percentile verrouillé, qui ne dépend d'aucun coefficient. */
  percentileDelta: number;
}

export type TrendVerdict = 'improving' | 'plateau' | 'declining' | 'insufficient';

export interface Trend {
  verdict: TrendVerdict;
  /** Les points retenus : le dernier segment de spec, fenêtre comprise. */
  points: TrajectoryPoint[];
  steps: TrendStep[];
  /** Pente du percentile verrouillé, en points par kill, sur la fenêtre. */
  percentileSlope: number;
  /** Amplitude du percentile sur la fenêtre. Un palier étroit se dit autrement qu'un large. */
  percentileSpread: number;
  /** Somme des restes sur la fenêtre : le gain qu'aucun contexte n'explique. */
  remainderTotal: number;
  /** La spec du segment décrit. */
  spec: string | null;
  /** Kills laissés dehors parce qu'ils ont été joués dans une autre spec. */
  droppedForSpecChange: number;
}

/**
 * Découpe la trajectoire aux changements de spec.
 *
 * Deux specs ne mesurent pas la même chose : relier leurs points tracerait une progression
 * là où il n'y a qu'un changement de personnage. Les points sans spec connue prolongent le
 * segment courant plutôt que d'en ouvrir un.
 */
export function segmentBySpec(points: TrajectoryPoint[]): TrajectoryPoint[][] {
  const segments: TrajectoryPoint[][] = [];
  let current: TrajectoryPoint[] = [];
  let spec: string | null = null;

  for (const p of points) {
    if (current.length > 0 && p.spec !== null && spec !== null && p.spec !== spec) {
      segments.push(current);
      current = [];
    }
    if (p.spec !== null) spec = p.spec;
    current.push(p);
  }

  if (current.length > 0) segments.push(current);
  return segments;
}

/**
 * L'écart entre deux kills, décomposé.
 *
 * Les deux parts se calculent sur le DPS de départ : sur la plage d'un palier, un modèle
 * multiplicatif linéarisé autour du point de départ suffit, et il reste lisible — chaque
 * part se lit en DPS, dans la même unité que l'écart qu'elle explique.
 */
export function decomposeStep(from: TrajectoryPoint, to: TrajectoryPoint): TrendStep {
  const dpsDelta = to.dps - from.dps;

  const ilvlPart =
    from.bracket !== null && to.bracket !== null
      ? (to.bracket - from.bracket) * DPS_PER_ILVL * from.dps
      : 0;

  const killTimePart =
    from.killTimeMs > 0 && to.killTimeMs > 0
      ? -((to.killTimeMs - from.killTimeMs) / from.killTimeMs) * KILL_TIME_ELASTICITY * from.dps
      : 0;

  // `+ 0` ramène le -0 de `Math.round` à 0 : un écart nul se lit « 0 », pas « -0 ».
  const round = (v: number) => Math.round(v) + 0;

  return {
    from,
    to,
    dpsDelta: round(dpsDelta),
    ilvlPart: round(ilvlPart),
    killTimePart: round(killTimePart),
    remainder: round(dpsDelta - ilvlPart - killTimePart),
    percentileDelta: Math.round((to.rankPercent - from.rankPercent) * 10) / 10,
  };
}

/** Moindres carrés du percentile contre le rang du kill. */
function slopePerKill(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;

  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (const [i, y] of values.entries()) {
    num += (i - meanX) * (y - meanY);
    den += (i - meanX) ** 2;
  }

  return den === 0 ? 0 : num / den;
}

/**
 * Le verdict sur les derniers kills de la spec courante.
 *
 * Il se lit sur le percentile verrouillé et non sur le DPS : c'est le seul axe déjà
 * normalisé contre la population du moment, donc le seul qui ne confonde pas la progression
 * du joueur avec celle de son palier. Le plateau est le message central pour la cible —
 * « ça monte » se voit sans outil, « ça ne monte plus, et l'équipement le cachait » non.
 */
export function analyseTrend(trajectory: TrajectoryPoint[]): Trend {
  const segments = segmentBySpec(trajectory);
  const last = segments.at(-1) ?? [];
  const points = last.slice(-TREND_WINDOW);
  const droppedForSpecChange = trajectory.length - last.length;

  const steps = points.slice(1).map((p, i) => decomposeStep(points[i], p));
  const percentiles = points.map((p) => p.rankPercent);
  const slope = points.length >= MIN_POINTS ? slopePerKill(percentiles) : 0;

  const verdict: TrendVerdict =
    points.length < MIN_POINTS
      ? 'insufficient'
      : slope > PLATEAU_SLOPE
        ? 'improving'
        : slope < -PLATEAU_SLOPE
          ? 'declining'
          : 'plateau';

  return {
    verdict,
    points,
    steps,
    percentileSlope: Math.round(slope * 10) / 10,
    percentileSpread:
      percentiles.length > 0
        ? Math.round((Math.max(...percentiles) - Math.min(...percentiles)) * 10) / 10
        : 0,
    remainderTotal: steps.reduce((a, s) => a + s.remainder, 0),
    spec: points.reduce<string | null>((acc, p) => p.spec ?? acc, null),
    droppedForSpecChange,
  };
}
