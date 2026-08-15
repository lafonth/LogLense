import { gql } from './client';
import { Q_COMBATANT, Q_COMBATANT_WITH_ACTORS } from './queries';

/**
 * A CombatantInfo event: the gear, stats and talent tree a player brought to one fight.
 * WCL exposes it as untyped JSON, so every field beyond the identifiers is optional.
 */
export interface CombatantEvent {
  sourceID: number;
  specID: number;
  /**
   * Le combat d'où sort la ligne. C'est le discriminant qui rend le lot exploitable : un
   * `CombatantInfo` est une ligne par joueur **et par combat**, donc le même `sourceID`
   * revient une fois par pull demandée. Sondé le 2026-08-15
   * (`scripts/probe-combatant-batch.ts`) : présent sur chaque ligne, égal à l'id demandé, y
   * compris quand la requête ne porte qu'un combat.
   */
  fight?: number;
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

/** Les `CombatantInfo` d'un rapport, déjà en vol, interrogeables combat par combat. */
export interface ReportCombatants {
  byActor: (fightId: number, actorId: number) => Promise<CombatantEvent | null>;
}

/**
 * Les `CombatantInfo` de plusieurs combats d'un même rapport, en une requête au total.
 *
 * `events` prend `fightIDs: [Int]!` depuis toujours, mais chaque rencontre partait avec le
 * sien : analyser un rapport de raid entier payait une requête par boss pour retrouver le même
 * joueur. Jumelle de `fetchReportRankings`, et pour les mêmes raisons — jusqu'au départ
 * immédiat de la requête, puisque le combattant est la toute première attente du pipeline.
 *
 * **La recherche passe par `fight`, jamais par l'ordre ni par le seul `sourceID`.** Un
 * `sourceID` identifie un acteur dans le rapport, pas dans un combat : sans le filtre, un lot
 * rendrait la première pull où le joueur apparaît. Ce n'est pas un chiffre décalé, c'est juger
 * l'éligibilité — set bonus, ilvl — sur l'équipement d'une autre pull.
 *
 * Le lot est borné par `MAX_ENCOUNTERS_PER_REQUEST` (20). La même sonde a mesuré 406 lignes
 * pour 20 combats sans pagination ; au-delà, `events` finirait par tronquer, et un combat
 * absent d'une réponse tronquée ne se distingue pas d'un combat sans combattant.
 */
export function fetchReportCombatants(
  token: string,
  code: string,
  fightIDs: number[]
): ReportCombatants {
  const query = gql<CombatantResponse>(token, Q_COMBATANT, { code, fightIDs });

  // Même puits que pour les classements : les accesseurs attendent bien cette promesse-ci,
  // mais un rapport dont toutes les rencontres échouent avant de la lire laisserait une
  // rejection sans destinataire, et Node termine le processus là-dessus.
  query.catch(() => {});

  return {
    async byActor(fightId, actorId) {
      const data = await query;
      return (
        data.reportData.report.events.data.find(
          (e) => e.fight === fightId && e.sourceID === actorId
        ) ?? null
      );
    },
  };
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
