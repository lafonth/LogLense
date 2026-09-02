import type { CombatantEvent } from './combatant';
import type { IconIndex } from './icons';
import type { CastEntry, CharacterStats, OpeningCast, RotationSummary } from '@/types';

/** parseStats reads gear, stats and talents — it never needs the combatant's identity. */
type CombatantStats = Omit<CombatantEvent, 'sourceID'>;

export interface WCLTable {
  data?: {
    entries?: Array<{ guid: number; name: string; total: number; abilityIcon?: string }>;
    auras?: Array<{
      guid: number;
      name: string;
      totalUptime: number;
      totalUses: number;
      abilityIcon?: string;
    }>;
  };
}

/**
 * L'index d'icônes de ce combat, pris dans les tables déjà récupérées.
 *
 * Aucune requête : `abilityIcon` voyage dans la charge de `table()` depuis toujours. Les
 * tables sont fusionnées dans l'ordre reçu et la première qui nomme une capacité gagne —
 * une même aura vue en buff et en debuff porte la même icône, l'ordre ne déplace rien.
 */
export function collectIcons(...tables: (WCLTable | null | undefined)[]): IconIndex {
  const icons: IconIndex = {};
  for (const table of tables) {
    for (const row of [...(table?.data?.entries ?? []), ...(table?.data?.auras ?? [])]) {
      if (row.abilityIcon && !icons[row.name]) icons[row.name] = row.abilityIcon;
    }
  }
  return icons;
}

export function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function parseStats(event: CombatantStats | null, name: string): CharacterStats | null {
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
      guid: entry.guid,
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

/** One entry of `events(dataType: Casts)`. Only what the opening chain reads. */
export interface CastEvent {
  timestamp: number;
  type: string;
  abilityGameID?: number;
  ability?: { guid?: number; name?: string };
}

/**
 * The ordered opening, from raw cast events.
 *
 * Three decisions worth stating. `begincast` is dropped: a channel would otherwise appear
 * twice, and what is compared is what landed. Names come from the aggregate `Casts` table,
 * which covers the whole fight and therefore every ability of its opening — so naming the
 * chain costs no further query. And offsets are counted from the *first* cast rather than
 * from the pull, because a slow reaction to the countdown is not a rotation mistake.
 */
export function parseOpening(
  events: CastEvent[],
  castTable: WCLTable,
  length: number
): OpeningCast[] {
  const names = new Map<number, string>();
  for (const entry of castTable.data?.entries ?? []) names.set(entry.guid, entry.name);

  const casts = events.filter((e) => e.type === 'cast').slice(0, length);
  if (casts.length === 0) return [];

  const start = casts[0].timestamp;
  return casts.map((event) => {
    const guid = event.abilityGameID ?? event.ability?.guid ?? 0;
    return {
      guid,
      name: event.ability?.name ?? names.get(guid) ?? `#${guid}`,
      offsetMs: event.timestamp - start,
    };
  });
}

export function summarizeRotation(
  name: string,
  casts: Record<string, CastEntry>,
  buffs: Record<string, number>,
  fightMs: number,
  opening: OpeningCast[],
  dps?: number,
  icons: IconIndex = {}
): RotationSummary {
  return { name, dps, fightDurationMs: fightMs, casts, buffs, opening, icons };
}
