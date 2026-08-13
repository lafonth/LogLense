import type { CandidatePool } from './references';
import { redisGet, redisSetEx } from '@/lib/redis';

/**
 * Durée de vie du vivier mis en cache.
 *
 * Explicite, et c'est tout l'enjeu : le §5d des CGU de Warcraft Logs interdit d'en
 * constituer une base de données permanente, pas d'en garder une copie de travail. Le TTL
 * est ce qui sépare les deux, donc il est nommé à l'écriture et jamais laissé au défaut de
 * Redis — un `SET` sans expiration ferait exactement l'objet interdit.
 *
 * Six heures : le classement mondial d'un boss bouge en jours, pas en minutes, et un vivier
 * de six heures d'âge sélectionne les mêmes références qu'un vivier frais.
 */
export const POOL_TTL_SECONDS = 6 * 60 * 60;

/**
 * Version du format sérialisé. La changer périme tout le cache d'un coup : une entrée écrite
 * par une version antérieure serait relue avec les champs d'aujourd'hui.
 */
const POOL_CACHE_VERSION = 'v2';

/**
 * Plafond de ce qu'on accepte d'écrire. Trois partitions de dix pages de cent entrées, c'est
 * trois fois le volume d'avant ; au-delà, le corps dépasserait ce qu'Upstash accepte en REST,
 * et l'écriture échouerait à chaque analyse au lieu de servir une seule fois.
 */
const MAX_CACHED_BYTES = 1_200_000;

/**
 * Le vivier ne dépend que du boss, de la difficulté et de la spec — jamais du joueur qui
 * demande l'analyse. C'est précisément ce qui rend le cache payant : tous les joueurs d'une
 * même spec sur un même boss partagent la même entrée.
 */
export function poolCacheKey(args: {
  encounterId: number;
  difficulty: number;
  specName: string;
  className: string;
}): string {
  const spec = args.specName.toLowerCase().replace(/\s+/g, '-');
  const klass = args.className.toLowerCase().replace(/\s+/g, '-');
  return `wcl:pool:${POOL_CACHE_VERSION}:${args.encounterId}:${args.difficulty}:${klass}:${spec}`;
}

/**
 * Lit un vivier en cache, ou rend `null` — y compris quand Redis est muet.
 *
 * Échoue ouvert, à l'inverse du quota : un cache manqué coûte des requêtes, un cache qui
 * refuserait coûterait l'analyse. Une entrée dont la forme ne correspond pas est traitée
 * comme absente plutôt que rendue telle quelle.
 */
export async function readCachedPool(key: string): Promise<CandidatePool | null> {
  try {
    const raw = await redisGet(key);
    if (typeof raw !== 'string' || raw.length === 0) return null;

    const parsed = JSON.parse(raw) as CandidatePool;
    if (
      !Array.isArray(parsed?.candidates) ||
      typeof parsed?.pagesFetched !== 'number' ||
      typeof parsed?.pagesExpected !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Écrit un vivier, avec son TTL. N'échoue jamais : le cache est une optimisation, pas une
 * dépendance.
 *
 * Un vivier incomplet n'est pas écrit. Une page manquante vient d'un échec réseau ponctuel,
 * et l'installer pour six heures figerait ce hasard sur toute la spec — alors que la relire
 * tout de suite est justement ce que le cache empêcherait.
 */
export async function writeCachedPool(key: string, pool: CandidatePool): Promise<void> {
  if (pool.pagesFetched < pool.pagesExpected) return;

  const body = JSON.stringify(pool);
  if (body.length > MAX_CACHED_BYTES) return;

  try {
    await redisSetEx(key, body, POOL_TTL_SECONDS);
  } catch {
    // Ignoré volontairement : l'analyse est déjà calculée, la perdre pour un cache raté
    // serait le contraire de ce que le cache est censé faire.
  }
}
