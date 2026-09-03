import { hashUserId } from '@/lib/labels/identity';
import { consumeAiGlobalQuota, consumeAiQuota } from '@/lib/labels/rate-limit';

/**
 * La garde des deux routes qui dépensent chez un fournisseur d'IA : quota horaire du compte,
 * puis quota horaire que tous les comptes partagent.
 *
 * Elle vit ici plutôt que dans chaque route parce que l'ordre des deux compteurs est la seule
 * chose subtile de l'affaire, et qu'une règle recopiée à deux endroits finit par n'être vraie
 * qu'à un seul. `wcl-guard.ts` porte la même paire pour la même raison.
 *
 * Le second plafond n'était pas nécessaire tant que le BYOK existait : un testeur qui apportait
 * sa clé payait ses propres rapports, et `AI_LIMIT` bornait le reste. Il l'est devenu le jour où
 * toute génération est passée sur notre compte — dix testeurs à vingt rapports font deux cents
 * appels par heure que rien ne bornait.
 *
 * Rend la réponse de refus, ou `null` quand la dépense est autorisée. À appeler **après** la
 * validation du corps : un quota se dépense sur une requête qui produira vraiment quelque chose,
 * pas sur une qu'on s'apprête à refuser pour une autre raison.
 *
 * @param userId  Le compte, déjà résolu par l'appelant — la session est exigée avant, et son
 *                absence est un 401, pas un dépassement de quota.
 * @param surface Ce que la réponse d'indisponibilité nomme. Le 429, lui, est le même des deux
 *                côtés : c'est le même compteur, le dire autrement laisserait croire le contraire.
 */
export async function guardAiSpend(
  userId: string,
  surface: 'AI reports' | 'Chat'
): Promise<Response | null> {
  let by: string;
  try {
    by = hashUserId(userId);
  } catch {
    return jsonResponse({ error: `${surface} unavailable` }, 503);
  }

  // Retenu plutôt que relu pour le second appel : la clé de compteur porte l'index de sa
  // fenêtre, et un `Date.now()` d'après pourrait déjà désigner la suivante.
  const atMs = Date.now();

  const verdict = await consumeAiQuota(by, atMs);

  // Le plafond commun ne se consulte qu'après celui du compte, et seulement s'il a laissé
  // passer. L'ordre inverse laisserait un appelant déjà refusé gonfler le compteur partagé à
  // chaque tentative — et comme un refus n'est jamais remboursé, un seul utilisateur qui
  // martèle fermerait la porte à tous les autres.
  const globalVerdict = verdict.allowed ? await consumeAiGlobalQuota(atMs) : null;

  // Celui des deux qui a décidé. Le commun n'existe que si le personnel a laissé passer, donc
  // il prend la main dès qu'il a parlé.
  const deciding = globalVerdict ?? verdict;

  if (deciding.unavailable) {
    return jsonResponse({ error: `${surface} unavailable` }, 503);
  }
  if (!deciding.allowed) {
    return jsonResponse({ error: 'Hourly AI quota reached' }, 429, {
      'Retry-After': String(deciding.retryAfterSeconds),
    });
  }

  return null;
}

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
