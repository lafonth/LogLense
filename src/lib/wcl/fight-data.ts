import type { CombatantEvent } from './combatant';
import type { EligibilityProfile } from './eligibility';
import type { FightContext } from './fight-context';
import type { CastEvent, WCLTable } from './parsers';
import type { CharacterStats, DamageEntry, FightTarget, RotationSummary } from '@/types';
import { gql } from './client';
import { MIN_TARGET_PCT, OPENING_EVENT_LIMIT, OPENING_LENGTH } from './constants';
import { eligibilityOf } from './eligibility';
import { fetchFightContext } from './fight-context';
import {
  collectIcons,
  parseCasts,
  parseOpening,
  parseStats,
  parseUptime,
  summarizeRotation,
} from './parsers';
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
            abilityIcon?: string;
            targets?: { name: string; total: number; type: string }[];
          }[];
        };
      };
    };
  };
}

interface RotationResponse {
  reportData: { report: { casts: WCLTable; buffs: WCLTable; debuffs: WCLTable } };
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
  /**
   * Ce qui est arrivé au raid pendant la pull. `null` quand l'appelant ne l'a pas demandé
   * — cf. `FightDataArgs.context` — ou quand la requête a échoué.
   */
  context: FightContext | null;
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
  /**
   * Demande le contexte de la pull, au prix d'une requête de plus.
   *
   * Seul le sujet le paie. Une référence est enregistrée dans le corpus par son pointeur
   * (`code`, `fightID`, `actorId`) : son contexte se réhydrate plus tard sans rien perdre,
   * alors que multiplier la requête par la fenêtre de vérification, non.
   */
  context?: { encounterId: number; difficulty: number };
}

export async function fetchFightData(token: string, args: FightDataArgs): Promise<FightData> {
  const { code, fightId, combatant, name, fightMs } = args;

  const vars = { code, fightIDs: [fightId], sourceID: combatant.sourceID };

  const [dmgData, rotData, castEvents, context] = await Promise.all([
    gql<DamageResponse>(token, Q_DAMAGE, vars),
    gql<RotationResponse>(token, Q_ROTATION, vars),
    // L'ouverture est un axe de plus, pas une dépendance : un log qui ne rend pas ses
    // événements de cast doit produire un rapport sans ouverture, pas une erreur.
    gql<CastEventsResponse>(token, Q_CAST_EVENTS, {
      ...vars,
      limit: OPENING_EVENT_LIMIT,
    }).catch(() => null),
    args.context
      ? fetchFightContext(token, {
          code,
          fightId,
          encounterId: args.context.encounterId,
          difficulty: args.context.difficulty,
          actorId: combatant.sourceID,
        })
      : null,
  ]);

  const allDmgEntries = dmgData.reportData.report.table.data?.entries ?? [];
  const totalDamage = allDmgEntries.reduce((sum, e) => sum + e.total, 0);

  const dps = args.dps ?? (fightMs > 0 ? Math.round(totalDamage / (fightMs / 1000)) : 0);

  const stats = parseStats(combatant, name)!;
  const castTable = rotData.reportData.report.casts;
  const casts = parseCasts(castTable, fightMs);
  // Les debuffs d'abord : sur une collision de nom, une même aura vue des deux côtés reste
  // la même aura, et l'entrée buff est celle qui existait avant — l'ordre choisi ne déplace
  // donc aucun affichage en place.
  const buffs = {
    ...parseUptime(rotData.reportData.report.debuffs, fightMs),
    ...parseUptime(rotData.reportData.report.buffs, fightMs),
  };
  const opening = parseOpening(
    castEvents?.reportData?.report?.events?.data ?? [],
    castTable,
    OPENING_LENGTH
  );
  // Les quatre tables du combat sont déjà en main : l'index d'icônes ne coûte qu'un
  // parcours. La table de dégâts en premier — c'est la seule qui nomme un sort dont le
  // joueur n'a rien lancé lui-même (un dot posé par un autre effet, une invocation).
  const icons = collectIcons(
    dmgData.reportData.report.table,
    castTable,
    rotData.reportData.report.buffs,
    rotData.reportData.report.debuffs
  );
  const rotation = summarizeRotation(name, casts, buffs, fightMs, opening, dps, icons);

  const damageEntries: DamageEntry[] = allDmgEntries
    .map((e) => ({ guid: e.guid, name: e.name, total: e.total }))
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

  return { stats, rotation, damageEntries, fightTargets, dps, eligibility, context };
}
