import type { CastEntry, CharacterStats, RotationSummary } from '@/types';

interface CombatantEvent {
  specID: number;
  gear?: { itemLevel: number; id: number; quality: number }[];
  agility?: number;
  strength?: number;
  intellect?: number;
  critMelee?: number;
  hasteMelee?: number;
  mastery?: number;
  versatilityDamageDone?: number;
  talentTree?: { id: number; rank?: number }[];
}

export interface WCLTable {
  data?: {
    entries?: Array<{ guid: number; name: string; total: number }>;
    auras?: Array<{ guid: number; name: string; totalUptime: number; totalUses: number }>;
  };
}

export function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function parseStats(event: CombatantEvent | null, name: string): CharacterStats | null {
  if (!event) return null;
  const gear = (event.gear ?? []).filter((g) => g.itemLevel >= 50);
  const avgIlvl =
    gear.length > 0
      ? Math.round((gear.reduce((sum, g) => sum + g.itemLevel, 0) / gear.length) * 10) / 10
      : 0;

  return {
    name,
    avgIlvl,
    primaryStat: event.agility ?? event.strength ?? event.intellect ?? 0,
    crit: event.critMelee ?? 0,
    haste: event.hasteMelee ?? 0,
    mastery: event.mastery ?? 0,
    vers: event.versatilityDamageDone ?? 0,
    talents: Object.fromEntries((event.talentTree ?? []).map((t) => [t.id, t.rank ?? 1])),
  };
}

export function parseCasts(table: WCLTable, fightMs: number): Record<string, CastEntry> {
  const durMin = fightMs / 60000;
  const result: Record<string, CastEntry> = {};
  for (const entry of table.data?.entries ?? []) {
    result[entry.name] = {
      casts: entry.total,
      perMin: Math.round((entry.total / durMin) * 100) / 100,
    };
  }
  return result;
}

export function parseUptime(table: WCLTable, fightMs: number): Record<string, number> {
  const result: Record<string, number> = {};
  for (const aura of table.data?.auras ?? []) {
    result[aura.name] = fightMs > 0 ? Math.round((aura.totalUptime / fightMs) * 1000) / 10 : 0;
  }
  return result;
}

export function summarizeRotation(
  name: string,
  casts: Record<string, CastEntry>,
  buffs: Record<string, number>,
  fightMs: number,
  dps?: number
): RotationSummary {
  return { name, dps, fightDurationMs: fightMs, casts, buffs };
}
