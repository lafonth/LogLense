import type { TrajectoryPoint } from './trajectory';
import { gql } from './client';
import { Q_CHARACTER_PARSE_DPS } from './queries';
import { parseTrajectory } from './trajectory';

/**
 * Les deux chemins d'analyse ne lisaient pas le même percentile.
 *
 * `characterData.character.encounterRankings` rend `rankPercent` = le percentile
 * **historique**, verrouillé au moment du kill (`lockedIn: true`), contre le nombre de
 * parses de la partition — 353 sur le cas mesuré. `reportData.report.rankings` rend, sous
 * le même nom `rankPercent`, le percentile **du jour**, recalculé contre la population
 * courante — 7 695 parses, soit 55 % là où le chemin personnage annonçait 60,9 %. Même
 * combat, même DPS au millième près, deux mesures sous un seul libellé.
 *
 * Le nombre que le raider reconnaît est l'historique : c'est celui que Warcraft Logs
 * verrouille et celui qu'il cite. Le chemin rapport doit donc aller le chercher là où il
 * existe, c'est-à-dire chez le personnage.
 */
export interface HistoricalParse {
  /** Percentile verrouillé, celui que le joueur cite. */
  rankPercent: number;
  /** Taille de la population historique. Sans elle, un percentile ne se lit pas. */
  rankTotalParses: number | null;
  todayPercent: number | null;
}

interface Rank {
  rankPercent?: number;
  rankTotalParses?: number;
  todayPercent?: number;
  report?: { code?: string; fightID?: number };
}

/**
 * Le slug de royaume tel que l'attend WCL : minuscules, espaces et apostrophes en tirets.
 * `Ysondre` → `ysondre`, `Kirin Tor` → `kirin-tor`.
 */
export function toServerSlug(serverName: string): string {
  return serverName.toLowerCase().replace(/['’]/g, '').replace(/\s+/g, '-');
}

/**
 * Retrouve, dans les parses d'un personnage, celui qui correspond au combat demandé.
 *
 * L'appariement se fait sur `code` **et** `fightID` : un joueur peut avoir plusieurs kills
 * dans un même rapport, et se tromper de combat rendrait le percentile faux d'une manière
 * qui ne se voit pas.
 */
export function findParseInRanks(
  payload: unknown,
  code: string,
  fightID: number
): HistoricalParse | null {
  const ranks = (payload as { ranks?: Rank[] } | null)?.ranks;
  if (!Array.isArray(ranks)) return null;

  const match = ranks.find((r) => r.report?.code === code && r.report?.fightID === fightID);
  if (!match || typeof match.rankPercent !== 'number') return null;

  return {
    rankPercent: match.rankPercent,
    rankTotalParses: typeof match.rankTotalParses === 'number' ? match.rankTotalParses : null,
    todayPercent: typeof match.todayPercent === 'number' ? match.todayPercent : null,
  };
}

export interface HistoricalParseQuery {
  name: string;
  serverName: string;
  regionSlug: string;
  encounterId: number;
  difficulty: number;
  specName: string;
  className: string;
  code: string;
  fightID: number;
}

/**
 * Le parse du combat demandé **et** toute l'histoire du personnage sur la rencontre.
 *
 * Les deux sortent du même `encounterRankings` : la trajectoire ne coûte pas une requête,
 * seulement une lecture de plus de la réponse déjà payée.
 */
export interface CharacterHistory {
  parse: HistoricalParse | null;
  trajectory: TrajectoryPoint[];
}

/**
 * Rend une histoire vide plutôt que de lever : le percentile est un axe d'affichage, pas
 * une dépendance du rapport. Un log privé, un personnage renommé ou une panne WCL doivent
 * coûter la réconciliation, jamais l'analyse.
 */
export async function fetchCharacterHistory(
  token: string,
  q: HistoricalParseQuery
): Promise<CharacterHistory> {
  try {
    const payload = await gql<{
      characterData: { character: { dps: unknown } | null };
    }>(token, Q_CHARACTER_PARSE_DPS, {
      name: q.name,
      slug: toServerSlug(q.serverName),
      region: q.regionSlug,
      encounterID: q.encounterId,
      difficulty: q.difficulty,
      specName: q.specName,
      className: q.className,
    });

    const dps = payload.characterData?.character?.dps;
    return {
      parse: findParseInRanks(dps, q.code, q.fightID),
      trajectory: parseTrajectory(dps, { code: q.code, fightID: q.fightID }),
    };
  } catch {
    return { parse: null, trajectory: [] };
  }
}
