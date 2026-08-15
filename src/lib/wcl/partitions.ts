import { redisGet, redisSetEx } from '@/lib/redis';
import { gql } from './client';
import { MAX_SEASON_PARTITIONS, PARTITION_TTL_SECONDS } from './constants';
import { Q_ENCOUNTER_PARTITIONS } from './queries';

export interface Partition {
  id: number;
  name: string;
  default: boolean;
}

interface ZonePayload {
  id: number;
  encounters: { id: number }[] | null;
  partitions: Partition[];
}

interface PartitionsResponse {
  worldData: { encounter: { zone: ZonePayload | null } | null };
}

/**
 * `v2` : la liste est désormais rangée sous la zone, pas sous la rencontre. Les deux formes
 * ne sont pas interchangeables — un id de zone et un id de rencontre sont tous deux des
 * entiers — et le préfixe seul ne les distinguerait pas d'un déploiement à l'autre.
 */
const PARTITION_CACHE_VERSION = 'v2';

/** Les partitions d'un palier. Une seule entrée pour toutes ses rencontres. */
export function zonePartitionsKey(zoneId: number): string {
  return `wcl:partitions:${PARTITION_CACHE_VERSION}:zone:${zoneId}`;
}

/**
 * Le palier d'une rencontre.
 *
 * Sans elle, un conteneur qui démarre froid devrait payer une requête Warcraft Logs juste
 * pour apprendre quelle zone lire — alors que la liste de ce palier est déjà en cache.
 *
 * Portée d'une durée de vie comme tout le reste, bien que la donnée soit immuable : ce qui
 * vient de Warcraft Logs et n'expire pas est la base de données permanente que les CGU
 * refusent. Voir l'en-tête de `redisSetEx`.
 */
export function encounterZoneKey(encounterId: number): string {
  return `wcl:partitions:${PARTITION_CACHE_VERSION}:enc:${encounterId}`;
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

/** Ce qu'une résolution apprend : un palier, ses rencontres, et ses partitions de saison. */
interface ResolvedZone {
  zoneId: number;
  encounterIds: number[];
  partitionIds: number[];
}

/**
 * Le palier de chaque rencontre déjà rencontrée, en mémoire du conteneur.
 *
 * Un fait immuable — une rencontre ne change pas de palier — donc sans durée de vie et sans
 * risque de péremption, à la différence de la liste de partitions elle-même, qui bouge à
 * chaque patch et reste dans Redis avec son expiration.
 *
 * Croissance bornée par le nombre de rencontres du jeu, deux nombres par entrée.
 */
const zoneOfEncounter = new Map<number, number>();

/**
 * Les résolutions en vol.
 *
 * C'est ce qui rend l'économie réelle. Les rencontres d'un rapport partent dans un même
 * `Promise.all` : elles interrogent le cache **avant** que la première réponse ne soit
 * revenue, donc aucune écriture de cache ne peut arriver à temps pour les autres. Sans
 * partage en vol, douze rencontres du même palier font douze requêtes qui rendent la même
 * réponse — et la mettent en cache douze fois.
 *
 * Un appelant qui ne trouve rien en cache attend donc les résolutions déjà parties, et se
 * sert si l'une d'elles couvre sa rencontre. Sinon il lance la sienne : deux paliers
 * analysés en même temps ne se volent pas leur réponse.
 */
let inFlight: Promise<ResolvedZone | null>[] = [];

/**
 * Oublie ce que le conteneur a appris. Pour les tests — l'état de module survit sinon d'un
 * cas au suivant, et un cache partagé rendrait les assertions dépendantes de leur ordre.
 */
export function clearZoneMemo(): void {
  zoneOfEncounter.clear();
  inFlight = [];
}

/** La liste en cache pour cette rencontre, ou `null` si rien de complet n'y est. */
async function readCachedPartitions(encounterId: number): Promise<number[] | null> {
  try {
    let zoneId = zoneOfEncounter.get(encounterId);

    if (zoneId === undefined) {
      const rawZone = await redisGet(encounterZoneKey(encounterId));
      const parsedZone = Number(rawZone);
      if (!rawZone || !Number.isInteger(parsedZone)) return null;
      zoneId = parsedZone;
      zoneOfEncounter.set(encounterId, zoneId);
    }

    const raw = await redisGet(zonePartitionsKey(zoneId));
    if (typeof raw !== 'string' || raw.length === 0) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((n) => typeof n === 'number')) {
      return parsed;
    }
    return null;
  } catch {
    // Cache muet : on redemande à WCL plutôt que d'abandonner la résolution.
    return null;
  }
}

/** Une requête Warcraft Logs, et ce qu'elle apprend sur tout le palier. */
async function discoverZone(token: string, encounterId: number): Promise<ResolvedZone | null> {
  let zone: ZonePayload | null;

  try {
    const data = await gql<PartitionsResponse>(token, Q_ENCOUNTER_PARTITIONS, {
      encounterID: encounterId,
    });
    zone = data.worldData.encounter?.zone ?? null;
  } catch {
    return null;
  }

  if (!zone) return null;

  const partitionIds = seasonPartitions(zone.partitions ?? []);
  // La rencontre demandée est du lot même si WCL ne renvoie pas la liste : c'est elle qui a
  // servi à trouver le palier. Le `Set` la dédoublonne quand la liste la contient déjà.
  const encounterIds = [...new Set([encounterId, ...(zone.encounters ?? []).map((e) => e.id)])];

  for (const id of encounterIds) zoneOfEncounter.set(id, zone.id);

  const resolved: ResolvedZone = { zoneId: zone.id, encounterIds, partitionIds };
  if (partitionIds.length > 0) await writeZoneCache(resolved);
  return resolved;
}

/**
 * Range la liste sous la zone, et le palier sous chacune de ses rencontres.
 *
 * Ne jette pas : le cache est une optimisation, pas une dépendance. Attendue, jamais
 * `void`ée — sur une fonction serverless, une écriture non attendue meurt avec l'invocation,
 * et l'analyse suivante repaierait la requête qu'on vient d'économiser.
 */
async function writeZoneCache(zone: ResolvedZone): Promise<void> {
  const body = JSON.stringify(zone.partitionIds);
  const zoneId = String(zone.zoneId);

  try {
    await Promise.all([
      redisSetEx(zonePartitionsKey(zone.zoneId), body, PARTITION_TTL_SECONDS),
      ...zone.encounterIds.map((id) =>
        redisSetEx(encounterZoneKey(id), zoneId, PARTITION_TTL_SECONDS)
      ),
    ]);
  } catch {
    // Voir l'en-tête.
  }
}

/**
 * Les ids de partition à interroger pour une rencontre, ou `[]`.
 *
 * `[]` veut dire « interroge sans argument `partition` » : c'est le repli quand WCL ou
 * Redis se taisent. Il rend le vivier par défaut — pauvre, mais l'analyse aboutit. Échoue
 * ouvert, comme le cache de vivier et à l'inverse du quota.
 *
 * Une réponse sert tout le palier. Ce qui était une requête par rencontre en est une par
 * zone : sur un rapport de raid entier, neuf à douze appels identiques deviennent un seul,
 * et le règlement de `guardMeteredWclSpend` rend la différence au quota de l'appelant.
 */
export async function resolveSeasonPartitions(
  token: string,
  encounterId: number
): Promise<number[]> {
  const cached = await readCachedPartitions(encounterId);
  if (cached) return cached;

  // Instantané : `inFlight` bouge pendant les `await` qui suivent, et une résolution partie
  // après notre lecture du cache ne peut rien nous apprendre que nous n'ayons déjà cherché.
  const pending = [...inFlight];
  for (const resolution of pending) {
    const zone = await resolution;
    if (zone?.encounterIds.includes(encounterId)) return zone.partitionIds;
  }

  // Enregistrée sans `await` entre la création et l'inscription : un appelant qui s'intercale
  // ne verrait pas la requête déjà partie et en lancerait une seconde.
  const discovery = discoverZone(token, encounterId);
  inFlight.push(discovery);

  try {
    return (await discovery)?.partitionIds ?? [];
  } finally {
    inFlight = inFlight.filter((p) => p !== discovery);
  }
}
