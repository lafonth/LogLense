import { redisGet, redisSetEx } from '@/lib/redis';
import { gql } from './client';
import { MAX_SEASON_PARTITIONS, PARTITION_TTL_SECONDS } from './constants';
import { Q_ENCOUNTER_PARTITIONS } from './queries';

export interface Partition {
  id: number;
  name: string;
  default: boolean;
}

interface PartitionsResponse {
  worldData: { encounter: { zone: { id: number; partitions: Partition[] } | null } | null };
}

const PARTITION_CACHE_VERSION = 'v1';

export function partitionCacheKey(encounterId: number): string {
  return `wcl:partitions:${PARTITION_CACHE_VERSION}:${encounterId}`;
}

/**
 * La saison d'un nom de partition : ses deux premiers segments.
 *
 * `12.0`, `12.0.5` et `12.0.7` partagent `12.0` ; `12.1` ouvre la suivante. Un numéro de
 * version majeure nu — `12` — se lit `12.0` : WCL nomme aujourd'hui la première partition
 * du palier `12.0`, mais la même saison s'écrit `12` partout ailleurs, et laisser les deux
 * formes diverger couperait la saison 1 en deux groupes d'une et deux partitions. Un nom
 * non numérique sans point — les paliers anciens n'ont qu'une partition `default` — reste
 * sa propre saison.
 */
export function seasonOf(name: string): string {
  const parts = name.split('.');
  if (parts.length === 1) return /^\d+$/.test(name) ? `${name}.0` : name;
  return parts.slice(0, 2).join('.');
}

/**
 * Les partitions de la saison d'ouverture du palier, les plus récentes d'abord bornées.
 *
 * L'ancrage est la *première* partition de la zone, pas celle que WCL marque `default`.
 * Une zone appartient à la saison où elle a ouvert ; ce qui vient après est du farm
 * hors-saison, joué avec un budget d'équipement d'une autre saison. Sur le palier courant,
 * `default` désigne `12.1` — saison 2, cinq logs — et l'ancrer là reproduirait le vivier
 * vide qu'on corrige.
 *
 * Limite assumée : l'ancrage porte sur la saison d'ouverture du palier, pas sur la date du
 * log analysé. `fetchCandidatePool` ne reçoit ni rapport ni date, et WCL n'expose aucune
 * date de début de partition qui permettrait la conversion. Un log de saison 2 sur un boss
 * de saison 1 est donc comparé à des références de saison 1 — sur le palier courant, cela
 * concerne cinq logs, contre plusieurs milliers pour le cas inverse.
 */
export function seasonPartitions(partitions: Partition[]): number[] {
  if (partitions.length === 0) return [];
  const ordered = [...partitions].sort((a, b) => a.id - b.id);
  const season = seasonOf(ordered[0].name);
  return ordered
    .filter((p) => seasonOf(p.name) === season)
    .slice(-MAX_SEASON_PARTITIONS)
    .map((p) => p.id);
}

/**
 * Les ids de partition à interroger pour une rencontre, ou `[]`.
 *
 * `[]` veut dire « interroge sans argument `partition` » : c'est le repli quand WCL ou
 * Redis se taisent. Il rend le vivier par défaut — pauvre, mais l'analyse aboutit. Échoue
 * ouvert, comme le cache de vivier et à l'inverse du quota.
 */
export async function resolveSeasonPartitions(
  token: string,
  encounterId: number
): Promise<number[]> {
  const key = partitionCacheKey(encounterId);

  try {
    const raw = await redisGet(key);
    if (typeof raw === 'string' && raw.length > 0) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((n) => typeof n === 'number')) return parsed;
    }
  } catch {
    // Cache muet : on redemande à WCL plutôt que d'abandonner la résolution.
  }

  let ids: number[];
  try {
    const data = await gql<PartitionsResponse>(token, Q_ENCOUNTER_PARTITIONS, {
      encounterID: encounterId,
    });
    ids = seasonPartitions(data.worldData.encounter?.zone?.partitions ?? []);
  } catch {
    return [];
  }

  if (ids.length === 0) return [];

  try {
    await redisSetEx(key, JSON.stringify(ids), PARTITION_TTL_SECONDS);
  } catch {
    // Le cache est une optimisation, pas une dépendance.
  }

  return ids;
}
