import type { CombatantEvent } from './combatant';
import type { WCLTable } from './parsers';
import type { CharacterStats, DamageEntry, FightTarget, RotationSummary } from '@/types';
import { gql } from './client';
import { parseCasts, parseStats, parseUptime, summarizeRotation } from './parsers';
import { Q_DAMAGE, Q_ROTATION } from './queries';

interface DamageResponse {
  reportData: {
    report: {
      table: {
        data?: {
          entries: {
            guid: number;
            name: string;
            total: number;
            targets?: { name: string; total: number; type: string }[];
          }[];
        };
      };
    };
  };
}

interface RotationResponse {
  reportData: { report: { casts: WCLTable; buffs: WCLTable } };
}

export interface FightData {
  stats: CharacterStats;
  rotation: RotationSummary;
  damageEntries: DamageEntry[];
  fightTargets: FightTarget[];
  dps: number;
}

export interface FightDataArgs {
  code: string;
  fightId: number;
  /** Already resolved by the caller, which needs it for spec detection anyway. */
  combatant: CombatantEvent;
  name: string;
  fightMs: number;
  /** Taken from the WCL ranking when there is one; derived from total damage otherwise. */
  dps?: number;
}

/** Targets below this share of total damage are noise, not fight structure. */
const MIN_TARGET_PCT = 1;

export async function fetchFightData(token: string, args: FightDataArgs): Promise<FightData> {
  const { code, fightId, combatant, name, fightMs } = args;

  const [dmgData, rotData] = await Promise.all([
    gql<DamageResponse>(token, Q_DAMAGE, {
      code,
      fightIDs: [fightId],
      sourceID: combatant.sourceID,
    }),
    gql<RotationResponse>(token, Q_ROTATION, {
      code,
      fightIDs: [fightId],
      sourceID: combatant.sourceID,
    }),
  ]);

  const allDmgEntries = dmgData.reportData.report.table.data?.entries ?? [];
  const totalDamage = allDmgEntries.reduce((sum, e) => sum + e.total, 0);

  const dps = args.dps ?? (fightMs > 0 ? Math.round(totalDamage / (fightMs / 1000)) : 0);

  const stats = parseStats(combatant, name)!;
  const casts = parseCasts(rotData.reportData.report.casts, fightMs);
  const buffs = parseUptime(rotData.reportData.report.buffs, fightMs);
  const rotation = summarizeRotation(name, casts, buffs, fightMs, dps);

  const damageEntries: DamageEntry[] = allDmgEntries
    .map((e) => ({ name: e.name, total: e.total }))
    .sort((a, b) => b.total - a.total);

  const targetTotals = new Map<string, { type: string; total: number }>();
  for (const entry of allDmgEntries) {
    for (const target of entry.targets ?? []) {
      if (target.type === 'Player') continue;
      const existing = targetTotals.get(target.name);
      if (existing) existing.total += target.total;
      else targetTotals.set(target.name, { type: target.type, total: target.total });
    }
  }

  const fightTargets: FightTarget[] = [...targetTotals.entries()]
    .map(([targetName, { type, total }]) => ({
      name: targetName,
      type,
      damagePct: totalDamage > 0 ? Math.round((total / totalDamage) * 1000) / 10 : 0,
    }))
    .filter((t) => t.damagePct >= MIN_TARGET_PCT)
    .sort((a, b) => b.damagePct - a.damagePct);

  return { stats, rotation, damageEntries, fightTargets, dps };
}
