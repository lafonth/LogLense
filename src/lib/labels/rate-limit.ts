import { redisExpire, redisIncr } from '@/lib/redis';

/** Verdicts par heure et par compte. Un joueur qui juge honnêtement n'approche pas ce seuil. */
export const LABEL_LIMIT = 60;

/**
 * Expositions par heure et par compte. Plus haut que les verdicts : une analyse écrit un
 * enregistrement par boss, et parcourir un raid entier en produit légitimement des dizaines.
 * Le seuil borne l'abus, il ne rationne pas l'usage.
 */
export const EXPOSURE_LIMIT = 120;

/** Préfixes de compteur. Deux quotas distincts : saturer l'un ne doit pas fermer l'autre. */
export const LABEL_PREFIX = 'ratelimit:labels';
export const EXPOSURE_PREFIX = 'ratelimit:exposure';

/** Largeur de la fenêtre. Fixe, pas glissante : un compteur, pas un historique à relire. */
export const WINDOW_MS = 3_600_000;

/**
 * La clé porte l'index de la fenêtre. Deux conséquences : deux fenêtres consécutives ne
 * partagent jamais de compteur, et une clé périmée s'efface d'elle-même sans qu'on ait à
 * la remettre à zéro.
 */
export function quotaKey(prefix: string, by: string, atMs: number): string {
  return `${prefix}:${by}:${Math.floor(atMs / WINDOW_MS)}`;
}

export function rateLimitKey(by: string, atMs: number): string {
  return quotaKey(LABEL_PREFIX, by, atMs);
}

export function exposureRateLimitKey(by: string, atMs: number): string {
  return quotaKey(EXPOSURE_PREFIX, by, atMs);
}

export interface RateVerdict {
  allowed: boolean;
  /** Secondes avant la fenêtre suivante. Zéro quand rien n'est refusé. */
  retryAfterSeconds: number;
}

/**
 * Consomme un jeton d'un quota horaire.
 *
 * **Échoue ouvert.** Redis en panne, c'est `redisAppend` qui refusera l'écriture juste
 * après ; refuser ici en plus ne protégerait rien et perdrait une donnée légitime — or ce
 * qui n'est pas capturé ne se rattrape pas.
 *
 * L'`EXPIRE` est posé à chaque appel, pas seulement quand le compteur vaut 1 : un `EXPIRE`
 * manqué sur la première écriture laisserait une clé éternelle, donc un compte verrouillé
 * pour toujours. Si l'`EXPIRE` échoue quand même, on laisse passer : la remise à zéro de la
 * fenêtre n'est plus garantie, et bloquer sur un compteur qui ne redescendra peut-être
 * jamais coûte plus cher que la requête qu'on laisse filer.
 */
export async function consumeQuota(
  prefix: string,
  limit: number,
  by: string,
  atMs: number
): Promise<RateVerdict> {
  const key = quotaKey(prefix, by, atMs);
  const windowSeconds = Math.ceil(WINDOW_MS / 1000);
  const retryAfterSeconds = Math.max(1, Math.ceil((WINDOW_MS - (atMs % WINDOW_MS)) / 1000));

  let count: number;
  try {
    count = await redisIncr(key);
  } catch {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  try {
    await redisExpire(key, windowSeconds);
  } catch {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return count > limit
    ? { allowed: false, retryAfterSeconds }
    : { allowed: true, retryAfterSeconds: 0 };
}

export function consumeLabelQuota(by: string, atMs: number): Promise<RateVerdict> {
  return consumeQuota(LABEL_PREFIX, LABEL_LIMIT, by, atMs);
}

export function consumeExposureQuota(by: string, atMs: number): Promise<RateVerdict> {
  return consumeQuota(EXPOSURE_PREFIX, EXPOSURE_LIMIT, by, atMs);
}
