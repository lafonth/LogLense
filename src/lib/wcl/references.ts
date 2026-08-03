import type { TopPlayer } from '@/types';
import { findCombatantBySpecId } from './combatant';
import { KILL_TIME_TOLERANCE, TOP_N } from './constants';
import { fetchFightData } from './fight-data';
import { fmtMs } from './parsers';

export interface WorldRanking {
  name: string;
  amount: number;
  duration: number;
  report: { code: string; fightID: number };
}

/**
 * Picks the logs a character is compared against.
 *
 * Kill time is the only comparability criterion applied today, and when no log
 * lands inside the window the caller silently gets the raw world top instead —
 * a comparison the product is meant to avoid. See PRODUCT_CONTEXT.md §7 (C2).
 */
export function selectReferencePool(all: WorldRanking[], fightMs: number): WorldRanking[] {
  const lo = fightMs * (1 - KILL_TIME_TOLERANCE);
  const hi = fightMs * (1 + KILL_TIME_TOLERANCE);

  const similar = all.filter((r) => r.duration >= lo && r.duration <= hi);

  return similar.length > 0 ? similar.slice(0, TOP_N) : all.slice(0, TOP_N);
}

/**
 * Fetches each reference player's fight in turn. Sequential on purpose for now:
 * widening the candidate window and parallelising it is a separate change.
 */
export async function fetchReferencePlayers(
  token: string,
  pool: WorldRanking[],
  specId: number
): Promise<TopPlayer[]> {
  const players: TopPlayer[] = [];

  for (const candidate of pool) {
    const { code, fightID } = candidate.report;
    if (!code || !fightID) continue;

    const combatant = await findCombatantBySpecId(token, code, fightID, specId);
    if (!combatant) continue;

    const dps = Math.round(candidate.amount);
    const { stats, rotation, damageEntries } = await fetchFightData(token, {
      code,
      fightId: fightID,
      combatant,
      name: candidate.name,
      fightMs: candidate.duration,
      dps,
    });

    players.push({
      stats: { ...stats, dps, killTime: fmtMs(candidate.duration) },
      rotation,
      damageTable: { entries: damageEntries },
    });
  }

  return players;
}
