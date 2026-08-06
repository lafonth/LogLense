import type { CombatantEvent } from './combatant';
import type { WCLTable } from './parsers';
import { EXTERNAL_TOLERANCE } from './constants';

/**
 * Buffs granted by another player that raise your damage, matched by spell id.
 *
 * By guid and not by name: the names are localised in the report of a non-English
 * raid, the ids are not. The list is deliberately short — only targeted offensive
 * externals, the ones a raid hands to one player and not to another. Raid-wide buffs
 * everybody has do not distort a comparison and are not here.
 */
export const OFFENSIVE_EXTERNALS: Record<number, string> = {
  10060: 'Power Infusion',
  395152: 'Ebon Might',
  410089: 'Prescience',
  413984: 'Shifting Sands',
};

/**
 * Runtime list, not just a union: the label endpoint validates what the browser sends
 * against it, and a second hand-written copy over there would drift from this one.
 */
export const DISQUALIFICATION_REASONS = ['set-bonus', 'external'] as const;
export type DisqualificationReason = (typeof DISQUALIFICATION_REASONS)[number];

export interface EligibilityProfile {
  /**
   * Pieces of the largest tier set worn. `null` means unknown — the fight carries no
   * gear at all — and never zero: a player wearing no tier and a report with a hole in
   * it read the same way otherwise, and only one of them should block a comparison.
   */
  tierPieces: number | null;
  /** Summed uptime, in points of fight duration, over the known offensive externals. */
  externalUptime: number;
  /** Which of them were received, so the panel can name what disqualified a reference. */
  externals: string[];
}

/**
 * The largest tier set worn, counted in pieces.
 *
 * Gear is grouped by `setID` and the biggest group wins: a player mid-transition carries
 * pieces of two tiers, and the bonus they actually hold comes from the larger half.
 */
export function tierPiecesOf(combatant: CombatantEvent): number | null {
  const gear = combatant.gear ?? [];
  if (gear.length === 0) return null;

  const bySet = new Map<number, number>();
  for (const piece of gear) {
    if (piece.setID == null) continue;
    bySet.set(piece.setID, (bySet.get(piece.setID) ?? 0) + 1);
  }

  return bySet.size === 0 ? 0 : Math.max(...bySet.values());
}

/** The bonus a piece count actually grants: 4p, 2p, or nothing. */
export function tierBonus(pieces: number | null): number | null {
  if (pieces === null) return null;
  if (pieces >= 4) return 4;
  if (pieces >= 2) return 2;
  return 0;
}

/** Uptime of each offensive external in the fight, as points of fight duration. */
export function externalsOf(
  buffs: WCLTable,
  fightMs: number
): { externalUptime: number; externals: string[] } {
  if (fightMs <= 0) return { externalUptime: 0, externals: [] };

  let externalUptime = 0;
  const externals: string[] = [];

  for (const aura of buffs.data?.auras ?? []) {
    const name = OFFENSIVE_EXTERNALS[aura.guid];
    if (!name) continue;
    externalUptime += Math.round((aura.totalUptime / fightMs) * 1000) / 10;
    externals.push(name);
  }

  return { externalUptime: Math.round(externalUptime * 10) / 10, externals };
}

export function eligibilityOf(
  combatant: CombatantEvent,
  buffs: WCLTable,
  fightMs: number
): EligibilityProfile {
  return { tierPieces: tierPiecesOf(combatant), ...externalsOf(buffs, fightMs) };
}

/**
 * Why a reference is not comparable to the player, if it is not.
 *
 * One principle covers both criteria: **a reference is eliminated only when it was helped
 * more than the player was.** A candidate wearing a lower tier bonus, or holding fewer
 * externals, still teaches something — it beat the player with less. The reverse does not:
 * the gap it shows is the raid's, not the player's.
 *
 * An unknown tier on either side is not a disqualification. Reading `null` as zero would
 * eliminate on a hole in the report, which is the one direction that cannot be recovered.
 */
export function disqualify(
  candidate: EligibilityProfile,
  mine: EligibilityProfile
): DisqualificationReason[] {
  const reasons: DisqualificationReason[] = [];

  const theirs = tierBonus(candidate.tierPieces);
  const ours = tierBonus(mine.tierPieces);
  if (theirs !== null && ours !== null && theirs > ours) reasons.push('set-bonus');

  if (candidate.externalUptime > mine.externalUptime + EXTERNAL_TOLERANCE) {
    reasons.push('external');
  }

  return reasons;
}
