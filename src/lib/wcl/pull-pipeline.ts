import type { PullComparison, PullSnapshot } from '@/lib/comparison/pull-comparison';
import { comparePulls } from '@/lib/comparison/pull-comparison';
import { findCombatantByActorId } from './combatant';
import { fetchFightData } from './fight-data';

/**
 * Ce qui désigne une pull avant qu'elle soit récupérée : les mêmes champs qu'un
 * `provenance` de référence, plus l'`encounterId`/`difficulty` qu'il faut pour demander le
 * contexte de raid — les deux pulls comparées jouent ici le rôle du sujet, contrairement à
 * une référence classée, donc les deux le paient (spec 04 §3 : « Affiché, pas seulement pris
 * en compte »).
 */
export interface PullPointer {
  code: string;
  fightId: number;
  actorId: number;
  name: string;
  fightMs: number;
  encounterId: number;
  difficulty: number;
}

/**
 * Résout un pointeur en instantané exploitable par `comparePulls`. `null` si le combattant
 * n'existe pas sur ce combat — pointeur périmé ou mal saisi, pas une erreur réseau.
 */
export async function fetchPullSnapshot(
  token: string,
  pointer: PullPointer
): Promise<PullSnapshot | null> {
  const combatant = await findCombatantByActorId(
    token,
    pointer.code,
    pointer.fightId,
    pointer.actorId
  );
  if (!combatant) return null;

  const { stats, rotation, damageEntries, dps, eligibility, context } = await fetchFightData(
    token,
    {
      code: pointer.code,
      fightId: pointer.fightId,
      combatant,
      name: pointer.name,
      fightMs: pointer.fightMs,
      context: { encounterId: pointer.encounterId, difficulty: pointer.difficulty },
    }
  );

  return {
    code: pointer.code,
    fightId: pointer.fightId,
    actorId: pointer.actorId,
    name: pointer.name,
    fightMs: pointer.fightMs,
    stats,
    rotation,
    damageEntries,
    dps,
    eligibility,
    context,
  };
}

export interface PullComparisonResult {
  before: PullSnapshot;
  after: PullSnapshot;
  comparison: PullComparison;
}

/**
 * Le point d'entrée de spec 04 : deux pointeurs, un `specId` pour lire les talents, un
 * résultat complet ou `null` si l'un des deux combattants est introuvable. Les deux fetchs
 * partent en parallèle — aucun ne dépend de l'autre, contrairement au chemin rapport où le
 * combattant du sujet doit être connu avant de fetcher.
 */
export async function fetchPullComparison(
  token: string,
  before: PullPointer,
  after: PullPointer,
  specId: number
): Promise<PullComparisonResult | null> {
  const [beforeSnapshot, afterSnapshot] = await Promise.all([
    fetchPullSnapshot(token, before),
    fetchPullSnapshot(token, after),
  ]);
  if (!beforeSnapshot || !afterSnapshot) return null;

  return {
    before: beforeSnapshot,
    after: afterSnapshot,
    comparison: comparePulls(beforeSnapshot, afterSnapshot, specId),
  };
}
