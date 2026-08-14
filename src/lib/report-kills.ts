import type { ReportFight } from '@/types';

/** Un kill du même boss, dans le même rapport : ce que le sélecteur de pull propose. */
export interface EncounterKill {
  fightId: number;
  fightMs: number;
}

export interface EncounterKills {
  id: number;
  name: string;
  /** Dans l'ordre du rapport : la première pull tuante d'abord, la dernière en fin de liste. */
  kills: EncounterKill[];
}

/**
 * Regroupe les kills d'un rapport par rencontre, à difficulté donnée.
 *
 * Un seul endroit décide de ce qui compte : le hook envoie la requête, le tableau de bord
 * construit la liste des boss et le sélecteur de pull. Les trois lisaient la même règle
 * réécrite trois fois — une divergence sur le filtre aurait décalé les index entre la
 * réponse du serveur et les boss affichés, sans rien casser de visible.
 */
export function groupKillsByEncounter(fights: ReportFight[], difficulty: number): EncounterKills[] {
  const byEncounter = new Map<number, EncounterKills>();

  for (const f of fights) {
    // Les pulls de trash ne portent pas de rencontre, et un wipe n'a pas de classement.
    if (!f.kill || f.difficulty !== difficulty || f.encounterID <= 0) continue;

    let group = byEncounter.get(f.encounterID);
    if (!group) {
      group = { id: f.encounterID, name: f.name, kills: [] };
      byEncounter.set(f.encounterID, group);
    }
    group.kills.push({ fightId: f.id, fightMs: f.endTime - f.startTime });
  }

  return [...byEncounter.values()];
}

/**
 * La pull analysée tant que l'utilisateur n'en choisit pas une autre : le dernier kill,
 * celui que le chemin rapport a toujours pris.
 */
export function lastKillOf(group: EncounterKills): EncounterKill {
  return group.kills[group.kills.length - 1];
}
