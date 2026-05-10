import { GUID_TO_NAME } from './constants';
import type { CharacterStats, CastEntry, RotationSummary } from '@/types';

interface CombatantEvent {
  specID: number;
  gear?: { itemLevel: number; id: number; quality: number }[];
  agility?: number;
  critMelee?: number;
  hasteMelee?: number;
  mastery?: number;
  versatilityDamageDone?: number;
  talentTree?: { id: number; rank?: number }[];
}

interface WCLCastEntry {
  guid: number;
  name: string;
  total: number;
}

interface WCLAuraEntry {
  guid: number;
  name: string;
  totalUptime: number;
  totalUses: number;
}

interface WCLTable {
  data?: {
    entries?: WCLCastEntry[];
    auras?: WCLAuraEntry[];
  };
}

export interface UptimeEntry {
  uptimePct: number;
  applications: number;
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
    agility: event.agility ?? 0,
    crit: event.critMelee ?? 0,
    haste: event.hasteMelee ?? 0,
    mastery: event.mastery ?? 0,
    vers: event.versatilityDamageDone ?? 0,
    talents: Object.fromEntries(
      (event.talentTree ?? []).map((t) => [t.id, t.rank ?? 1])
    ),
  };
}

export function parseCasts(table: WCLTable, fightMs: number): Record<string, CastEntry> {
  const durMin = fightMs / 60000;
  const result: Record<string, CastEntry> = {};
  for (const entry of table.data?.entries ?? []) {
    const name = GUID_TO_NAME[entry.guid] ?? entry.name;
    result[name] = {
      casts: entry.total,
      perMin: Math.round((entry.total / durMin) * 100) / 100,
    };
  }
  return result;
}

export function parseUptime(
  table: WCLTable,
  fightMs: number,
  wanted: Set<string>
): Record<string, UptimeEntry> {
  const result: Record<string, UptimeEntry> = {};
  for (const aura of table.data?.auras ?? []) {
    const name = GUID_TO_NAME[aura.guid] ?? aura.name;
    if (!wanted.has(name)) continue;
    result[name] = {
      uptimePct: fightMs > 0 ? Math.round((aura.totalUptime / fightMs) * 1000) / 10 : 0,
      applications: aura.totalUses,
    };
  }
  return result;
}

function c(casts: Record<string, CastEntry>, ability: string) {
  return casts[ability]?.casts ?? 0;
}

function pm(fightMs: number, totalCasts: number) {
  return Math.round((totalCasts / (fightMs / 60000)) * 100) / 100;
}

export function summarizeRotation(
  name: string,
  casts: Record<string, CastEntry>,
  buffUptime: Record<string, UptimeEntry>,
  debuffUptime: Record<string, UptimeEntry>,
  fightMs: number,
  dps?: number
): RotationSummary {
  const frenzy = c(casts, 'Feral Frenzy') + c(casts, 'Frantic Frenzy');
  const berserk = c(casts, 'Berserk') + c(casts, 'Incarnation');
  const moonfire = c(casts, 'Moonfire') + c(casts, 'Moonfire (LI)');

  return {
    name,
    dps,
    fightDurationMs: fightMs,
    cooldowns: {
      "Tiger's Fury": casts["Tiger's Fury"] ?? { casts: 0, perMin: 0 },
      Frenzy: { casts: frenzy, perMin: pm(fightMs, frenzy) },
      Berserk: { casts: berserk, perMin: pm(fightMs, berserk) },
      Convoke: casts['Convoke the Spirits'] ?? { casts: 0, perMin: 0 },
    },
    generators: {
      Shred: casts['Shred'] ?? { casts: 0, perMin: 0 },
      Swipe: casts['Swipe'] ?? { casts: 0, perMin: 0 },
      Moonfire: { casts: moonfire, perMin: pm(fightMs, moonfire) },
    },
    finishers: {
      Rip: casts['Rip'] ?? { casts: 0, perMin: 0 },
      'Ferocious Bite': casts['Ferocious Bite'] ?? { casts: 0, perMin: 0 },
      'Primal Wrath': casts['Primal Wrath'] ?? { casts: 0, perMin: 0 },
    },
    uptime: {
      "Tiger's Fury %": buffUptime["Tiger's Fury"]?.uptimePct ?? 0,
      'Rip %': debuffUptime['Rip']?.uptimePct ?? 0,
      'Rake %': debuffUptime['Rake']?.uptimePct ?? 0,
    },
  };
}
