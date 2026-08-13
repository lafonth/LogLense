import { createHash } from 'node:crypto';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';
import { consumeWclQuota } from '@/lib/labels/rate-limit';

/**
 * Coût nominal d'une analyse de boss, en appels Warcraft Logs.
 *
 * Mesuré sur le pipeline : le vivier de candidats, la vérification de chacun, puis les
 * dégâts et la rotation du joueur et des références. Le vivier vaut au pire
 * `MAX_SEASON_PARTITIONS × CANDIDATE_PAGES` requêtes, plus une pour résoudre les partitions
 * — le reste du pipeline ne change pas. Le chiffre est un ordre de grandeur volontairement
 * haut — un plafond sous-estimé ne plafonne rien.
 */
export const BOSS_ANALYSIS_UNITS = 90;

/** Une requête, une unité : liste de zones, métadonnées d'un rapport, recherche de royaume. */
export const METADATA_UNITS = 1;

/**
 * Coût du classement d'un raid : une requête, mais large — rankings, table de dégâts et
 * `CombatantInfo` de tous les acteurs dans le même appel. Comptée pour plus qu'une
 * métadonnée, très loin d'une analyse de boss : c'est exactement ce qui rend l'écran de tri
 * gratuit à ouvrir.
 */
export const RAID_RANKING_UNITS = 3;

/**
 * Coût d'une comparaison de deux pulls (spec 04) : deux `fetchFightData`, chacune dégâts,
 * rotation, cast events et contexte de raid, sans vivier ni classement. Nettement sous
 * `BOSS_ANALYSIS_UNITS` — c'est précisément ce qui rend l'écran bon marché à ouvrir.
 */
export const PULL_COMPARISON_UNITS = 10;

/**
 * Bosses analysables en une requête de `/api/report/analyze`.
 *
 * La route éclate en un `Promise.all` sur les rencontres, chacune valant
 * `BOSS_ANALYSIS_UNITS`. Sans borne, un tableau de mille entrées dépenserait cinquante mille
 * appels avant que le quota n'ait la moindre occasion de se prononcer.
 */
export const MAX_ENCOUNTERS_PER_REQUEST = 20;

function jsonResponse(
  body: unknown,
  status: number,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/**
 * Identifiant de compteur, dérivé du compte appelant.
 *
 * Distinct de `hashUserId`, qui refuse d'écrire sans `LABEL_SALT` : là-bas l'empreinte entre
 * dans un corpus conservé, et un identifiant non salé y serait réversible pour toujours. Ici
 * la clé vit une heure, n'est jamais relue et ne sert qu'à compter — la faire dépendre du sel
 * fermerait toutes les routes WCL d'un déploiement qui n'a simplement pas activé la capture.
 * Le sel est utilisé quand il existe, son absence n'est pas un motif de refus.
 */
export function quotaSubject(userId: string): string {
  const salt = process.env.LABEL_SALT ?? '';
  return createHash('sha256').update(`${salt}:wcl:${userId}`).digest('hex').slice(0, 32);
}

/**
 * Garde des routes qui dépensent le budget Warcraft Logs : session obligatoire, puis quota
 * horaire pondéré par le coût réel de la requête.
 *
 * Rend la réponse de refus, ou `null` quand la dépense est autorisée. À appeler après la
 * validation du corps — un quota se dépense sur une requête qui aboutira, pas sur une qu'on
 * s'apprête à refuser pour une autre raison.
 */
export async function guardWclSpend(units: number): Promise<Response | null> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.email ?? session?.user?.name ?? '';
  if (!userId) {
    return jsonResponse({ error: 'Sign in to analyse logs' }, 401);
  }

  const verdict = await consumeWclQuota(quotaSubject(userId), Date.now(), units);
  if (verdict.unavailable) {
    return jsonResponse({ error: 'Analysis temporarily unavailable' }, 503);
  }
  if (!verdict.allowed) {
    return jsonResponse({ error: 'Hourly Warcraft Logs quota reached' }, 429, {
      'Retry-After': String(verdict.retryAfterSeconds),
    });
  }

  return null;
}
