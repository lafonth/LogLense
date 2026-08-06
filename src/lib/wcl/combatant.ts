import { gql } from './client';
import { Q_COMBATANT, Q_COMBATANT_WITH_ACTORS } from './queries';

/**
 * A CombatantInfo event: the gear, stats and talent tree a player brought to one fight.
 * WCL exposes it as untyped JSON, so every field beyond the identifiers is optional.
 */
export interface CombatantEvent {
  sourceID: number;
  specID: number;
  /** `setID` groups the pieces of one tier set; absent on everything that is not tier. */
  gear?: { itemLevel: number; id: number; quality: number; setID?: number }[];
  agility?: number;
  strength?: number;
  intellect?: number;
  critMelee?: number;
  hasteMelee?: number;
  mastery?: number;
  versatilityDamageDone?: number;
  talentTree?: { id: number; rank?: number }[];
}

interface CombatantResponse {
  reportData: { report: { events: { data: CombatantEvent[] } } };
}

interface CombatantWithActorsResponse {
  reportData: {
    report: {
      events: { data: CombatantEvent[] };
      masterData: { actors: { id: number; name: string; type: string }[] };
    };
  };
}

export async function findCombatantByActorId(
  token: string,
  code: string,
  fightId: number,
  actorId: number
): Promise<CombatantEvent | null> {
  const data = await gql<CombatantResponse>(token, Q_COMBATANT, { code, fightIDs: [fightId] });
  return data.reportData.report.events.data.find((e) => e.sourceID === actorId) ?? null;
}

export async function findCombatantByName(
  token: string,
  code: string,
  fightId: number,
  characterName: string
): Promise<CombatantEvent | null> {
  const data = await gql<CombatantWithActorsResponse>(token, Q_COMBATANT_WITH_ACTORS, {
    code,
    fightIDs: [fightId],
  });

  const actor = data.reportData.report.masterData.actors.find(
    (a) => a.name === characterName && a.type === 'Player'
  );
  if (!actor) return null;

  return data.reportData.report.events.data.find((e) => e.sourceID === actor.id) ?? null;
}
