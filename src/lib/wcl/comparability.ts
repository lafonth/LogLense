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

/**
 * Le niveau corrigé de la taille réelle du panel : un panel plus court que `TOP_N` ne peut
 * pas être annoncé mieux que `poor`.
 *
 * Ce n'est pas une pénalité, c'est ce que la mesure vaut. `comparabilityLevel` tranche sur la
 * **médiane** des distances, choisie précisément pour sa robustesse — une valeur extrême y est
 * absorbée par ses voisines. Une médiane de une ou deux valeurs n'a plus cette propriété : elle
 * dit la distance de la seule référence trouvée, pas la solidité d'un panel. Deux logs proches
 * peuvent parfaitement mériter d'être lus, et ils restent affichés ; ce que le bandeau ne doit
 * pas faire est de leur donner la même confiance qu'à trois.
 *
 * C'est le point de sortie de l'étape 6 du plan de retours : les filtres à la source peuvent
 * vider le vivier, et **un vivier réduit sous `TOP_N` ne doit jamais passer sans que le niveau
 * de comparabilité le dise**. `POOL_FLOOR` limite le cas ; il ne le supprime pas — un rapport
 * privé ou un combattant introuvable réduisent le panel après coup, hors de portée du vivier.
 *
 * Fonction à part et non règle glissée dans `comparabilityLevel` : la resélection du chat
 * (`comparison/cohort.ts`) appelle le second et n'est pas dans la portée de l'étape, qui
 * s'arrête à `pipeline.ts` et `report-pipeline.ts`.
 */
export function levelWithPanelSize(
  level: ComparabilityLevel,
  panelSize: number,
  expected: number
): ComparabilityLevel {
  if (level === 'none' || panelSize === 0) return 'none';
  return panelSize < expected ? 'poor' : level;
}

/**
 * Points de correspondance dépensés par unité de tolérance sur la partie linéaire.
 *
 * Choisis pour que les deux seuils de `comparabilityLevel` tombent sur des chiffres ronds :
 * distance 1 — un axe exactement à sa tolérance, le plancher de `close` — vaut 75 %, et
 * distance 2, le plancher d'`approximate`, vaut 50 %.
 */
const MATCH_POINTS_PER_UNIT = 25;

/** Où la partie linéaire s'arrête et la queue prend le relais : le plancher d'`approximate`. */
const MATCH_LINEAR_LIMIT = 2;

/**
 * `distance` rendue en pourcentage de correspondance, comme Warcraft Logs en affiche un
 * au-dessus de ses filtres de classement. `null` quand le candidat n'a pas pu être scoré.
 *
 * **L'échelle est choisie, pas déduite** — le joueur croira ce chiffre, donc elle est écrite
 * ici plutôt que lisible seulement à l'écran :
 *
 * - **0 → 100 %.** Même ilvl, même kill time : rien ne sépare les deux logs sur les axes
 *   que nous mesurons.
 * - **Linéaire jusqu'à la distance 2, à 25 points par unité de tolérance.** Les deux chiffres
 *   qui comptent sont ceux sur lesquels `comparabilityLevel` tranche déjà : la distance 1 vaut
 *   **75 %** — le plancher d'un panel `close` — et la distance 2 vaut **50 %**, celui d'un
 *   panel `approximate`. Sous 50 %, la médiane d'un panel est `poor`. Les deux lectures ne
 *   peuvent donc pas se contredire : elles lisent la même graduation.
 * - **Hyperbolique au-delà, `100 / d`.** Elle rejoint la partie linéaire en 2 avec la même
 *   valeur *et* la même pente (−25 points par unité), donc rien ne casse à la jointure, et
 *   elle approche 0 sans l'atteindre : un candidat scoré loin est mauvais, pas non scoré, et
 *   les deux ne doivent pas se lire pareil.
 * - **Plancher à 1 %, et `null` au-dessus.** `null` est réservé à une distance qui n'est pas
 *   un nombre — pas d'ilvl sur le candidat, ou pas d'ilvl sur le joueur. Arrondir un candidat
 *   très lointain à `0 %` le ferait passer pour non scoré, ce qui est autre chose.
 *
 * Monotone sur tout le domaine : un candidat plus proche ne lit jamais plus bas qu'un plus
 * lointain.
 */
export function matchPercent(distance: number): number | null {
  if (!Number.isFinite(distance)) return null;

  const raw =
    distance <= MATCH_LINEAR_LIMIT
      ? 100 - MATCH_POINTS_PER_UNIT * distance
      : (100 - MATCH_POINTS_PER_UNIT * MATCH_LINEAR_LIMIT) * (MATCH_LINEAR_LIMIT / distance);

  // Une distance négative est impossible (`scoreCandidate` rend une racine carrée) : la borne
  // haute est là pour que la fonction reste totale, pas pour couvrir un cas attendu.
  return Math.min(100, Math.max(1, Math.round(raw)));
}
