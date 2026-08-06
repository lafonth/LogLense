import type { CombatantEvent } from './combatant';
import type { EligibilityProfile } from './eligibility';
import type { CastEvent, WCLTable } from './parsers';
import type { CharacterStats, DamageEntry, FightTarget, RotationSummary } from '@/types';
import { gql } from './client';
import { OPENING_EVENT_LIMIT, OPENING_LENGTH } from './constants';
import { eligibilityOf } from './eligibility';
import { parseCasts, parseOpening, parseStats, parseUptime, summarizeRotation } from './parsers';
import { Q_CAST_EVENTS, Q_DAMAGE, Q_ROTATION } from './queries';

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

interface CastEventsResponse {
  reportData: { report: { events: { data?: CastEvent[] } } };
}

export interface FightData {
  stats: CharacterStats;
  rotation: RotationSummary;
  damageEntries: DamageEntry[];
  fightTargets: FightTarget[];
  dps: number;
  /**
   * What the player brought that a reference will be judged against. Derived from the
   * combatant and the buff table already fetched here — it costs no extra query.
   */
  eligibility: EligibilityProfile;
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

  const vars = { code, fightIDs: [fightId], sourceID: combatant.sourceID };

  const [dmgData, rotData, castEvents] = await Promise.all([
    gql<DamageResponse>(token, Q_DAMAGE, vars),
    gql<RotationResponse>(token, Q_ROTATION, vars),
    // L'ouverture est un axe de plus, pas une dépendance : un log qui ne rend pas ses
    // événements de cast doit produire un rapport sans ouverture, pas une erreur.
    gql<CastEventsResponse>(token, Q_CAST_EVENTS, {
      ...vars,
      limit: OPENING_EVENT_LIMIT,
    }).catch(() => null),
  ]);

  const allDmgEntries = dmgData.reportData.report.table.data?.entries ?? [];
  const totalDamage = allDmgEntries.reduce((sum, e) => sum + e.total, 0);

  const dps = args.dps ?? (fightMs > 0 ? Math.round(totalDamage / (fightMs / 1000)) : 0);

  const stats = parseStats(combatant, name)!;
  const castTable = rotData.reportData.report.casts;
  const casts = parseCasts(castTable, fightMs);
  const buffs = parseUptime(rotData.reportData.report.buffs, fightMs);
  const opening = parseOpening(
    castEvents?.reportData?.report?.events?.data ?? [],
    castTable,
    OPENING_LENGTH
  );
  const rotation = summarizeRotation(name, casts, buffs, fightMs, opening, dps);

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

  const eligibility = eligibilityOf(combatant, rotData.reportData.report.buffs, fightMs);

  return { stats, rotation, damageEntries, fightTargets, dps, eligibility };
}
