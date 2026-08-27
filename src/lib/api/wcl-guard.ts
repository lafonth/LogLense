import type { WclRoute } from '@/lib/labels/record-demand';
import { createHash } from 'node:crypto';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';
import {
  consumeWclGlobalQuota,
  consumeWclQuota,
  settleWclGlobalQuota,
  settleWclQuota,
} from '@/lib/labels/rate-limit';
import { recordDemand } from '@/lib/labels/record-demand';
import { meterWclCalls } from '@/lib/wcl/meter';
import { PROMOTION_WCL_CALLS } from '@/lib/wcl/promote';

/**
 * Ce qu'une analyse de boss **réserve** sur le budget Warcraft Logs, en appels.
 *
 * Une réservation, plus un coût : `guardMeteredWclSpend` la prend avant la première requête
 * — c'est le seul instant où le plafond borne quelque chose — puis règle la différence avec
 * ce qui est réellement parti. Le chiffre reste donc un ordre de grandeur volontairement
 * haut, ce qu'un plafond doit être, sans que l'utilisateur paie l'écart.
 *
 * Mesuré sur le pipeline : le vivier de candidats, la vérification de chacun, puis les
 * dégâts et la rotation du joueur et des références. Le vivier vaut au pire
 * `MAX_SEASON_PARTITIONS × CANDIDATE_PAGES` requêtes, plus une pour résoudre les partitions
 * — le reste du pipeline ne change pas. Servie par les caches de référence, la même analyse
 * en dépense une poignée.
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
 * Coût de la promotion d'un candidat en référence complète, depuis le chat.
 *
 * Réservation **exacte**, pas un forfait : `promoteReference` fait trois requêtes ou zéro, et
 * le règlement de `guardMeteredWclSpend` n'est pas jouable ici — il solde quand `run` se
 * résout, or la promotion part de l'intérieur d'un corps SSE déjà commencé. Le chiffre vient
 * donc de `PROMOTION_WCL_CALLS` plutôt que d'être recopié : un quatrième appel ajouté à
 * `fetchFightData` doit se voir sur le budget le jour où il est ajouté, pas au relevé suivant.
 *
 * Une promotion servie par le cache de dégâts ne dépense rien chez Warcraft Logs mais débite
 * quand même le quota. C'est assumé : la réservation est prise avant de savoir si le cache
 * répond, et un plafond qui se laisse sonder gratuitement n'en est plus un.
 */
export const PROMOTION_UNITS = PROMOTION_WCL_CALLS;

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
 * Garde des routes qui dépensent le budget Warcraft Logs : session obligatoire, puis deux quotas
 * horaires pondérés par le coût réel de la requête — celui du compte, puis celui que tous les
 * comptes partagent.
 *
 * Le second existe parce que le premier ne compose pas : dix bêta-testeurs, c'est dix fois
 * `WCL_UNIT_LIMIT` par heure sans qu'aucun n'ait rien fait d'anormal, là où la sanction d'en
 * face porte sur la clé et arrête le produit entier.
 *
 * Rend la réponse de refus, ou `null` quand la dépense est autorisée. À appeler après la
 * validation du corps — un quota se dépense sur une requête qui aboutira, pas sur une qu'on
 * s'apprête à refuser pour une autre raison.
 *
 * C'est aussi le seul endroit où la demande adressée à WCL est observable en entier : les trois
 * issues du quota y passent, et `recordDemand` les consigne toutes les trois. Le 401, lui,
 * n'écrit rien — aucun verdict de quota n'existe encore à ce stade, et la friction de
 * l'allowlist est une autre mesure, qui ne se range pas dans les mêmes seaux.
 */
export async function guardWclSpend(route: WclRoute, units: number): Promise<Response | null> {
  const reserved = await reserve(route, units);
  return reserved.refusal;
}

/**
 * Le même garde, pour les deux routes dont le forfait est très au-dessus du coût réel :
 * réservation avant la première requête, règlement après la dernière.
 *
 * Une analyse de boss réserve `BOSS_ANALYSIS_UNITS`. Servie par les caches de référence,
 * elle en dépense une poignée. Sans règlement, l'économie du cache irait entièrement à la
 * facture Warcraft Logs et rien à l'utilisateur, dont le quota horaire continuerait de
 * fondre au tarif plein — le produit n'y gagnerait rien de visible.
 *
 * Sonder les caches avant de facturer serait plus simple mais n'est pas possible : le garde
 * tourne avant la résolution du personnage, la route ne connaît alors ni sa spec ni sa
 * classe, donc aucune des clés de cache qui répondraient à la question.
 *
 * Le règlement se fait sur la fenêtre de la réservation, retenue ici, et **sur les deux
 * compteurs** — celui du compte et celui que tous les comptes partagent. Un refus, lui, n'est
 * jamais réglé : rembourser une requête refusée rendrait le plafond franchissable
 * indéfiniment — refus, remboursement, refus.
 *
 * `recordDemand` continue de consigner le forfait, pas le règlement : c'est ce que la
 * requête a demandé au budget, et c'est ce que la distribution de demande cherche à lire.
 */
export async function guardMeteredWclSpend(
  route: WclRoute,
  units: number,
  run: () => Promise<Response>
): Promise<Response> {
  const { refusal, subject, atMs } = await reserve(route, units);
  if (refusal) return refusal;

  return meterWclCalls(run, async (calls) => {
    const delta = calls - units;
    // Les deux compteurs ont réservé le même forfait, ils règlent le même écart. N'en régler
    // qu'un laisserait le plafond commun mordre sur des appels qui ne sont jamais partis.
    await settleWclQuota(subject, atMs, delta);
    await settleWclGlobalQuota(atMs, delta);
  });
}

interface Reservation {
  /** La réponse de refus, ou `null` quand la dépense est autorisée. */
  refusal: Response | null;
  /** Le compteur débité, et l'instant qui désigne sa fenêtre. Vides sur un 401. */
  subject: string;
  atMs: number;
}

async function reserve(route: WclRoute, units: number): Promise<Reservation> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.email ?? session?.user?.name ?? '';
  if (!userId) {
    return {
      refusal: jsonResponse({ error: 'Sign in to analyse logs' }, 401),
      subject: '',
      atMs: 0,
    };
  }

  const subject = quotaSubject(userId);
  // Retenu plutôt que relu au règlement : la clé de compteur porte l'index de sa fenêtre, et
  // un `Date.now()` d'après pourrait déjà désigner la suivante.
  const atMs = Date.now();

  const verdict = await consumeWclQuota(subject, atMs, units);

  // Le plafond commun ne se consulte qu'après celui du compte, et seulement s'il a laissé
  // passer. L'ordre inverse laisserait un appelant déjà refusé gonfler le compteur partagé à
  // chaque tentative — et comme un refus n'est jamais réglé, un seul raider qui martèle
  // fermerait la porte aux neuf autres.
  const globalVerdict = verdict.allowed ? await consumeWclGlobalQuota(atMs, units) : null;

  // Attendu avant la réponse, refus compris : c'est l'invariant des écritures de corpus, et le
  // 429 est justement l'enregistrement qu'on ne peut pas reconstituer après coup.
  await recordDemand(route, units, verdict, userId, globalVerdict);

  // Celui des deux qui a décidé. Le commun n'existe que si le personnel a laissé passer, donc
  // il prend la main dès qu'il a parlé.
  const deciding = globalVerdict ?? verdict;

  if (deciding.unavailable) {
    return {
      refusal: jsonResponse({ error: 'Analysis temporarily unavailable' }, 503),
      subject,
      atMs,
    };
  }
  if (!deciding.allowed) {
    return {
      refusal: jsonResponse({ error: 'Hourly Warcraft Logs quota reached' }, 429, {
        'Retry-After': String(deciding.retryAfterSeconds),
      }),
      subject,
      atMs,
    };
  }

  return { refusal: null, subject, atMs };
}
