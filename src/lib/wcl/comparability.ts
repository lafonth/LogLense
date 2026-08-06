import { ILVL_TOLERANCE, KILL_TIME_TOLERANCE } from './constants';

export interface CandidateMetrics {
  /** The candidate's item level, as WCL reports it on a ranking entry. */
  bracketData?: number;
  duration: number;
}

export interface ScoredCandidate<T> {
  candidate: T;
  /** Combined distance in tolerance units. 1 = at the edge of tolerance overall. */
  distance: number;
}

export type ComparabilityLevel = 'close' | 'approximate' | 'poor' | 'none';

/**
 * How far a candidate sits from the player, combining item level and kill time.
 *
 * Each gap is divided by its own tolerance so the two become comparable, then
 * combined euclidean-style: being excellent on one axis does not fully excuse a
 * gap on the other.
 */
export function scoreCandidate(
  candidate: CandidateMetrics,
  myIlvl: number,
  myDurationMs: number
): number {
  // Finiteness, not just a null check: a NaN gets through an undefined/null guard and
  // then scores NaN, which the sort comparator coerces to +0 — the entry keeps its
  // position and is selected first, unscored.
  const { bracketData, duration } = candidate;
  if (bracketData == null || !Number.isFinite(bracketData) || !Number.isFinite(duration)) {
    return Number.POSITIVE_INFINITY;
  }

  // Same convention as the missing-bracketData guard above: with no item level for the
  // player, no candidate can be judged comparable on gear, so the comparison is reported
  // as `poor` rather than silently scored on kill time alone.
  if (myIlvl <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  const ilvlGap = Math.abs(bracketData - myIlvl) / ILVL_TOLERANCE;

  const killTimeGap =
    myDurationMs > 0 ? Math.abs(duration - myDurationMs) / myDurationMs / KILL_TIME_TOLERANCE : 0;

  return Math.sqrt(ilvlGap ** 2 + killTimeGap ** 2);
}

/** The `limit` candidates closest to the player, each carrying the distance it sorted on. */
export function selectClosest<T extends CandidateMetrics>(
  candidates: T[],
  myIlvl: number,
  myDurationMs: number,
  limit: number
): ScoredCandidate<T>[] {
  return candidates
    .map((candidate) => ({
      candidate,
      distance: scoreCandidate(candidate, myIlvl, myDurationMs),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

export function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** How legitimate the comparison is, from the median distance of the chosen references. */
export function comparabilityLevel(scored: ScoredCandidate<unknown>[]): ComparabilityLevel {
  if (scored.length === 0) return 'none';

  const median = medianOf(scored.map((s) => s.distance));
  if (median === null) return 'none';
  if (median <= 1) return 'close';
  if (median <= 2) return 'approximate';
  return 'poor';
}
