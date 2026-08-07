/**
 * La trajectoire d'un joueur sur une rencontre : tous ses kills classés, dans l'ordre.
 *
 * Elle sort du même `encounterRankings` que le percentile historique — donc sans requête
 * supplémentaire. Trois propriétés de la source commandent ce module :
 *
 * - **`ranks[]` n'arrive pas trié.** L'ordre observé sur un cas réel : 22/04, 13/05, 06/05,
 *   29/04, 09/04. Le tri croissant n'est pas cosmétique, il est la condition pour que la
 *   suite ait un sens.
 * - **L'instant du kill est `startTime` de l'entrée**, pas `report.startTime` : ce dernier
 *   date l'ouverture du log, plusieurs heures plus tôt.
 * - **Ce sont des kills uniquement.** Warcraft Logs ne classe pas un wipe : la courbe ne
 *   dit rien des soirées ratées, et l'écran devra le dire.
 *
 * `guild` est présent dans la source et volontairement ignoré : c'est un nom de tiers, que
 * le §5c des CGU interdit de faire entrer où que ce soit.
 */
export interface TrajectoryPoint {
  /** Instant du kill, en ISO. */
  at: string;
  dps: number;
  /** Percentile verrouillé au moment du kill — celui que le joueur reconnaît. */
  rankPercent: number;
  /** Le même parse recalculé contre la population du jour, quand la source le donne. */
  todayPercent: number | null;
  /** ilvl du bracket : l'axe matériel de l'écart entre deux points. */
  bracket: number | null;
  killTimeMs: number;
  code: string;
  fightID: number;
  /**
   * Spec jouée sur ce kill. Une trajectoire ne se lit pas à travers un changement de spec :
   * l'écran segmente dessus plutôt que de relier deux points qui ne mesurent pas la même
   * chose.
   */
  spec: string | null;
  /** Le combat dont le rapport parle. Sur le chemin personnage, c'est le meilleur parse. */
  analysed: boolean;
}

interface RawRank {
  startTime?: number;
  duration?: number;
  amount?: number;
  bracketData?: number;
  rankPercent?: number;
  todayPercent?: number;
  spec?: string;
  report?: { code?: string; fightID?: number };
}

/** Le combat analysé, quand on sait lequel c'est. */
export interface AnalysedFight {
  code: string;
  fightID: number;
}

function toPoint(r: RawRank): TrajectoryPoint | null {
  const code = r.report?.code;
  const fightID = r.report?.fightID;

  if (typeof code !== 'string' || code === '') return null;
  if (typeof fightID !== 'number') return null;
  if (typeof r.startTime !== 'number' || !Number.isFinite(r.startTime)) return null;
  if (typeof r.amount !== 'number' || !Number.isFinite(r.amount)) return null;
  if (typeof r.rankPercent !== 'number' || !Number.isFinite(r.rankPercent)) return null;

  return {
    at: new Date(r.startTime).toISOString(),
    dps: Math.round(r.amount),
    rankPercent: Math.round(r.rankPercent * 10) / 10,
    todayPercent: typeof r.todayPercent === 'number' ? Math.round(r.todayPercent * 10) / 10 : null,
    bracket: typeof r.bracketData === 'number' ? r.bracketData : null,
    killTimeMs: typeof r.duration === 'number' ? r.duration : 0,
    code,
    fightID,
    spec: typeof r.spec === 'string' && r.spec !== '' ? r.spec : null,
    analysed: false,
  };
}

/**
 * `encounterRankings` → la suite des kills, du plus ancien au plus récent.
 *
 * Une entrée dont il manque la date, le DPS, le percentile ou le combat d'origine est
 * écartée : un point sans abscisse déplacerait la courbe sans rien mesurer. Le
 * dédoublonnage se fait sur `code:fightID`, la seule identité d'un combat.
 */
export function parseTrajectory(
  payload: unknown,
  analysed?: AnalysedFight | null
): TrajectoryPoint[] {
  const ranks = (payload as { ranks?: RawRank[] } | null)?.ranks;
  if (!Array.isArray(ranks)) return [];

  const points = ranks
    .map(toPoint)
    .filter((p): p is TrajectoryPoint => p !== null)
    .sort((a, b) => a.at.localeCompare(b.at));

  const seen = new Set<string>();
  const unique: TrajectoryPoint[] = [];
  for (const p of points) {
    const key = `${p.code}:${p.fightID}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({
      ...p,
      analysed: analysed ? p.code === analysed.code && p.fightID === analysed.fightID : false,
    });
  }

  return unique;
}
