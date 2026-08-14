import { clearTokenCache } from './auth';
import { API_URL, REQUEST_TIMEOUT_MS, RETRY_POLICY } from './constants';
import { countWclCall } from './meter';

/**
 * Une requête WCL qui a échoué, avec de quoi savoir pourquoi.
 *
 * L'`Error` générique d'avant rendait un throttling indiscernable d'un log privé : les
 * deux traversaient le même `.catch(() => null)` et sortaient en « boss non analysé ». Le
 * statut est conservé pour que l'appelant puisse un jour les traiter différemment, et
 * `attempts` dit si la reprise a réellement eu lieu.
 */
export class WCLError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly attempts: number
  ) {
    super(message);
    this.name = 'WCLError';
  }
}

export interface RetryPolicy {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

/**
 * Les statuts qui disent « pas maintenant » plutôt que « pas comme ça ».
 *
 * 429 est le quota, les 5xx sont des pannes d'en face. Un 4xx autre est une requête que
 * répéter ne corrigera pas : la rejouer dépenserait la clé pour rien.
 */
function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * `Retry-After`, en millisecondes. L'en-tête admet deux formes — un nombre de secondes ou
 * une date HTTP — et WCL n'est tenu à aucune des deux. Illisible vaut absent.
 */
export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds >= 0 ? seconds * 1000 : null;
  const date = Date.parse(header);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - Date.now());
}

/**
 * L'attente avant la tentative suivante : exponentielle, mais jamais moins que ce que le
 * serveur a demandé, et jamais plus que le plafond. Ignorer un `Retry-After` plus long que
 * le backoff, c'est revenir avant l'heure et se faire refuser une fois de plus.
 */
export function retryDelayMs(
  attempt: number,
  retryAfter: string | null,
  policy: RetryPolicy
): number {
  const backoff = policy.baseDelayMs * 2 ** (attempt - 1);
  const asked = parseRetryAfter(retryAfter);
  return Math.min(asked === null ? backoff : Math.max(asked, backoff), policy.maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export async function gql<T>(
  token: string,
  query: string,
  variables?: Record<string, unknown>,
  policy: RetryPolicy = RETRY_POLICY
): Promise<T> {
  // Le point de passage unique de toute requête WCL, donc le seul endroit où la dépense
  // réelle d'une analyse est mesurable. Compté ici, avant la boucle : une requête, une unité
  // — c'est dans cette unité que le forfait réservé par `guardMeteredWclSpend` est libellé.
  countWclCall();

  let last: WCLError | null = null;

  for (let attempt = 1; attempt <= policy.attempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, ...(variables ? { variables } : {}) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (cause) {
      // Coupure réseau ou dépassement du délai : rien n'a été lu, donc rien n'interdit de
      // recommencer. La requête n'ayant pas abouti, elle n'a rien coûté au quota non plus.
      last = new WCLError(
        `WCL request failed: ${cause instanceof Error ? cause.message : 'network error'}`,
        null,
        attempt
      );
      if (attempt < policy.attempts) {
        await sleep(retryDelayMs(attempt, null, policy));
        continue;
      }
      throw last;
    }

    if (!res.ok) {
      // Le jeton en cache a expiré plus tôt que sa date annoncée. Le vider ici ne sauve pas
      // cette requête — les identifiants ne sont pas connus d'ici — mais rend la suivante
      // possible au lieu de laisser toute la session buter sur le même jeton mort.
      if (res.status === 401) clearTokenCache();

      last = new WCLError(`WCL request failed: ${res.status}`, res.status, attempt);
      if (isRetryable(res.status) && attempt < policy.attempts) {
        await sleep(retryDelayMs(attempt, res.headers?.get('Retry-After') ?? null, policy));
        continue;
      }
      throw last;
    }

    const body = (await res.json()) as { data?: T; errors?: { message: string }[] };

    // Une erreur GraphQL sort avec un 200 : elle porte sur la requête, pas sur le
    // transport. La rejouer telle quelle donnerait la même erreur.
    if (body.errors?.length) {
      throw new WCLError(`WCL GraphQL error: ${body.errors[0].message}`, res.status, attempt);
    }

    return body.data as T;
  }

  /* c8 ignore next */
  throw last ?? new WCLError('WCL request failed', null, policy.attempts);
}
