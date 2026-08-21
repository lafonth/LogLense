/**
 * Le classement d'un combat : les joueurs d'une même pull, ordonnés par marge de progression.
 *
 * Le pipeline individuel coûte cher parce qu'il résout un vivier de références. Ici, rien de
 * tel : `report.rankings` porte déjà un percentile par joueur, et un percentile est une
 * position dans une distribution, donc déjà une mesure de marge. Le classement tient en une
 * requête (`Q_RAID_RANKING`).
 *
 * Deux axes possibles, jamais confondus et jamais silencieux : le percentile quand les
 * rankings couvrent tout le combat, le DPS brut sinon. Le second n'est pas le premier en
 * moins précis — il ordonne par dégâts et pénalise mécaniquement les specs faibles du tier.
 * `criterionReason` porte de quoi l'écrire en clair à l'écran.
 */
import type { CombatantEvent } from './combatant';
import { getSpecByName } from '@/lib/specs';
import { gql } from './client';
import { combatantsByActor, tierPiecesOf } from './eligibility';
import { Q_RAID_RANKING } from './queries';

export type RankingCriterion = 'percentile' | 'dps';

export interface RankedRaider {
  /** L'acteur **dans ce rapport** — pas le `id` des rankings, qui est un personnage global. */
  actorId: number;
  name: string;
  className: string | null;
  specName: string | null;
  specId: number | null;
  dps: number;
  percentile: number | null;
  /**
   * Pièces du set de tier portées, lues dans le `CombatantInfo` du combat. `null` quand le
   * rapport ne le porte pas — jamais zéro, qui dirait « aucune pièce » (cf. `eligibility.ts`).
   */
  tierPieces: number | null;
}

export interface RaidRanking {
  code: string;
  fightID: number;
  encounterID: number;
  encounterName: string;
  difficulty: number | null;
  kill: boolean;
  fightMs: number;
  criterion: RankingCriterion;
  /** Pourquoi cet axe, en une phrase destinée à l'écran. */
  criterionReason: string;
  players: RankedRaider[];
}

interface RawRankedCharacter {
  name?: string;
  amount?: number;
  rankPercent?: number;
  spec?: string;
  class?: string;
}

interface RawDamageEntry {
  id?: number;
  name?: string;
  total?: number;
  type?: string;
  icon?: string;
}

interface RawFight {
  id: number;
  name?: string;
  encounterID?: number;
  kill?: boolean | null;
  difficulty?: number | null;
  startTime?: number;
  endTime?: number;
}

export interface RawRaidRanking {
  reportData: {
    report: {
      rankings?: { data?: { roles?: Record<string, { characters?: RawRankedCharacter[] }> }[] };
      table?: { data?: { entries?: RawDamageEntry[] } };
      events?: { data?: CombatantEvent[] };
      fights?: RawFight[];
      masterData?: { actors?: { id: number; name: string; subType?: string }[] };
    } | null;
  };
}

/** Les rôles que le produit ne classe pas : il mesure le DPS (spec « mode raid » §7). */
const NON_DPS_ROLES = ['tanks', 'healers'];

function round(value: number): number {
  return Math.round(value);
}

/**
 * L'icône d'une entrée de table de dégâts vaut `Classe-Spec` — la seule source de spec
 * disponible quand les rankings manquent. Une icône d'une autre forme ne dit rien.
 */
function specFromIcon(icon: string | undefined): { className: string; specName: string } | null {
  if (!icon) return null;
  const [className, specName] = icon.split('-');
  if (!className || !specName) return null;
  return { className, specName };
}

/**
 * Le classement d'un combat, à partir de la réponse brute de `Q_RAID_RANKING`.
 *
 * Séparé de la requête pour rester testable sans réseau : c'est ici que se décide l'axe.
 */
export function parseRaidRanking(payload: RawRaidRanking, code: string): RaidRanking | null {
  const report = payload.reportData.report;
  if (!report) return null;

  const fight = report.fights?.[0];
  if (!fight) return null;

  const fightMs = Math.max(0, (fight.endTime ?? 0) - (fight.startTime ?? 0));

  // Le nom est la seule clé commune aux rankings et au rapport : `rankings[].id` est un
  // identifiant global de personnage, inutilisable pour ouvrir un acteur de ce rapport.
  const actorIdByName = new Map<string, number>();
  for (const actor of report.masterData?.actors ?? []) {
    if (actor?.name) actorIdByName.set(actor.name, actor.id);
  }
  const damagers = (report.table?.data?.entries ?? []).filter((e) => (e.total ?? 0) > 0);
  for (const entry of damagers) {
    if (entry.name && entry.id !== undefined && !actorIdByName.has(entry.name)) {
      actorIdByName.set(entry.name, entry.id);
    }
  }

  const combatants = combatantsByActor(report.events?.data ?? []);
  const tierPiecesFor = (actorId: number): number | null => {
    const combatant = combatants.get(actorId);
    return combatant ? tierPiecesOf(combatant) : null;
  };

  const roles = report.rankings?.data?.[0]?.roles;
  const rankedDps = roles?.dps?.characters ?? [];
  const allRanked = Object.values(roles ?? {}).flatMap((r) => r?.characters ?? []);
  const rankedNames = new Set(allRanked.map((c) => c.name).filter((n): n is string => !!n));

  const uncovered = damagers.filter((e) => e.name && !rankedNames.has(e.name));
  const missingPercentile = rankedDps.filter((c) => typeof c.rankPercent !== 'number');

  const base = {
    code,
    fightID: fight.id,
    encounterID: fight.encounterID ?? 0,
    encounterName: fight.name ?? '',
    difficulty: fight.difficulty ?? null,
    kill: fight.kill ?? false,
    fightMs,
  };

  if (allRanked.length > 0 && uncovered.length === 0 && missingPercentile.length === 0) {
    const players: RankedRaider[] = [];
    for (const c of rankedDps) {
      const actorId = c.name ? actorIdByName.get(c.name) : undefined;
      if (!c.name || actorId === undefined) continue;
      const info = c.class && c.spec ? getSpecByName(c.class, c.spec) : null;
      players.push({
        actorId,
        name: c.name,
        className: c.class ?? null,
        specName: c.spec ?? null,
        specId: info?.specId ?? null,
        dps: round(c.amount ?? 0),
        percentile: Math.round((c.rankPercent ?? 0) * 10) / 10,
        tierPieces: tierPiecesFor(actorId),
      });
    }
    players.sort(
      (a, b) => (a.percentile ?? 0) - (b.percentile ?? 0) || a.name.localeCompare(b.name)
    );
    return {
      ...base,
      criterion: 'percentile',
      criterionReason:
        'Ranked by Warcraft Logs percentile: where each player sits in the distribution for their spec on this boss. The lowest has the most room to gain.',
      players,
    };
  }

  // Repli DPS. Il change la nature du classement, donc il se nomme — et il dit pourquoi.
  const nonDpsNames = new Set(
    NON_DPS_ROLES.flatMap((role) => roles?.[role]?.characters ?? [])
      .map((c) => c.name)
      .filter((n): n is string => !!n)
  );
  const percentileByName = new Map<string, number>();
  for (const c of rankedDps) {
    if (c.name && typeof c.rankPercent === 'number') percentileByName.set(c.name, c.rankPercent);
  }

  const players: RankedRaider[] = [];
  for (const entry of damagers) {
    const name = entry.name;
    const actorId = name ? actorIdByName.get(name) : undefined;
    if (!name || actorId === undefined || nonDpsNames.has(name)) continue;
    const fromIcon = specFromIcon(entry.icon);
    const className = fromIcon?.className ?? entry.type ?? null;
    const specName = fromIcon?.specName ?? null;
    const info = className && specName ? getSpecByName(className, specName) : null;
    const pct = percentileByName.get(name);
    players.push({
      actorId,
      name,
      className,
      specName,
      specId: info?.specId ?? null,
      dps: fightMs > 0 ? round(((entry.total ?? 0) / fightMs) * 1000) : 0,
      percentile: pct === undefined ? null : Math.round(pct * 10) / 10,
      tierPieces: tierPiecesFor(actorId),
    });
  }
  players.sort((a, b) => a.dps - b.dps || a.name.localeCompare(b.name));

  const brut =
    'the order is raw DPS, not a position in a distribution: specs that are weak this tier sit at the bottom for that reason alone.';
  const reason =
    allRanked.length === 0
      ? `Warcraft Logs ranks nobody on this pull, ${brut} Roles are unknown, so healers and tanks show up in the list.`
      : uncovered.length > 0
        ? `The Warcraft Logs ranking leaves ${uncovered.length} player(s) of this pull without an entry, out of ${damagers.length} who dealt damage, ${brut}`
        : `${missingPercentile.length} of the ${rankedDps.length} DPS on this pull have no Warcraft Logs percentile, ${brut}`;

  return { ...base, criterion: 'dps', criterionReason: reason, players };
}

/** Le classement d'un combat, en une requête. */
export async function fetchRaidRanking(
  token: string,
  code: string,
  fightID: number
): Promise<RaidRanking | null> {
  const payload = await gql<RawRaidRanking>(token, Q_RAID_RANKING, { code, fightIDs: [fightID] });
  return parseRaidRanking(payload, code);
}
