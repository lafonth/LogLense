import type { BossResult } from '@/types';
import { randomUUID } from 'node:crypto';
import { redisGet, redisSetEx } from '@/lib/redis';

/**
 * Instantané d'un `BossResult` rendu, pour qu'un lien partagé n'ait pas à rejouer le pipeline.
 *
 * Le cas d'usage est le partage entre membres d'une même guilde : le second lecteur ouvre le
 * lien du premier et voit le rendu que le premier a vu. Sans instantané, cette ouverture
 * relance une cinquantaine de requêtes chez Warcraft Logs pour reconstituer un résultat qui
 * vient d'être calculé.
 *
 * **Lisible par un utilisateur connecté seulement.** Aucun code d'authentification ici : la
 * lecture se fait à l'intérieur de `guardMeteredWclSpend`, dont la réservation refuse un
 * appelant anonyme en 401 avant d'exécuter quoi que ce soit. C'est §2a des CGU qui l'impose —
 * une page publique rendant une analyse dérivée de Warcraft Logs ferait de LogLense une
 * publication concurrente d'Archon, propriété de RPGLogs, dont on attend justement la
 * signature. Rouvrir la question en public suppose cette signature, pas un aménagement ici.
 *
 * Même contrat que les caches de référence : clé versionnée, expiration explicite, lecture
 * qui échoue ouvert, écriture qui ne jette jamais et refuse un résultat incomplet.
 */

/**
 * Durée de vie d'un instantané.
 *
 * Vingt-quatre heures, comme `REFERENCE_TTL_SECONDS`, et pour la même raison : le TTL n'est
 * pas une fraîcheur, c'est la frontière légale. Ce qui expire est une copie de travail ; ce
 * qui n'expire pas serait la base de données permanente que les CGU de Warcraft Logs
 * refusent. La péremption ne pose ici aucun problème de justesse — la lecture est demandée
 * explicitement par le lien, et ce que le lien désigne est le rendu qu'on a partagé, pas
 * l'état du jour.
 */
export const SNAPSHOT_TTL_SECONDS = 24 * 60 * 60;

const SNAPSHOT_CACHE_VERSION = 'v1';

/**
 * Plafond de taille d'une entrée. Bien plus haut que celui des caches de référence : un
 * `BossResult` porte le sujet **et** les `TOP_N` références, chacune avec sa rotation entière
 * et sa table de dégâts, plus l'échantillon de la fenêtre de vérification.
 */
const MAX_CACHED_BYTES = 1_200_000;

/**
 * Clé d'un instantané du chemin personnage.
 *
 * La variante entre dans la clé — surcharge de spec et combat forcé. Elle n'est jamais lue
 * (un changement de variante est une demande neuve, jamais servie par l'instantané) mais elle
 * est écrite : sans elle, un basculement de spec écraserait l'instantané de base, et le lien
 * partagé rendrait ensuite l'autre spec.
 *
 * Les trois champs venus du client — royaume, nom, code de rapport — sont encodés et passent
 * en dernier. Ils sont les seuls que nous ne formons pas nous-mêmes : sans encodage, un nom
 * portant le séparateur déborderait sur le champ voisin, et `Foo:ysondre` sur un royaume vide
 * désignerait la même clé que `Foo` sur `ysondre`.
 */
export function characterSnapshotKey(args: {
  region: string;
  serverSlug: string;
  characterName: string;
  encounterId: number;
  difficulty: number;
  specId: number;
  specIdOverride?: number;
  fightOverride?: { code: string; fightID: number };
}): string {
  const { region, encounterId, difficulty, specId, specIdOverride, fightOverride } = args;
  const spec = specIdOverride ?? 'base';
  const fight = fightOverride
    ? `${encodeURIComponent(fightOverride.code)}#${fightOverride.fightID}`
    : 'best';
  const who = `${encodeURIComponent(args.serverSlug)}:${encodeURIComponent(args.characterName)}`;

  return `wcl:snap:${SNAPSHOT_CACHE_VERSION}:char:${region}:${encounterId}:${difficulty}:${specId}:${spec}:${fight}:${who}`;
}

/**
 * Clé d'un instantané du chemin rapport.
 *
 * `fightId` y figure en plus de `encounterId` : sur ce chemin la pull analysée est choisie —
 * `switchPull` en change sans changer de rencontre — et deux pulls du même boss ne rendent
 * pas la même analyse.
 */
export function reportSnapshotKey(args: {
  code: string;
  actorId: number;
  encounterId: number;
  fightId: number;
  difficulty: number;
}): string {
  const { actorId, encounterId, fightId, difficulty } = args;

  return `wcl:snap:${SNAPSHOT_CACHE_VERSION}:report:${difficulty}:${encounterId}:${fightId}:${actorId}:${encodeURIComponent(args.code)}`;
}

/**
 * Un instantané n'est écrit que complet.
 *
 * Sans référence ou sans table de dégâts, l'écran rend une coquille : ni panel de comparaison,
 * ni répartition des dégâts. C'est un résultat légitime — une spec obscure sur un boss peu
 * joué peut n'avoir aucun candidat qualifié — mais figé pour vingt-quatre heures il
 * transformerait un incident de collecte en verdict. Le refus d'écrire fait retomber le lien
 * partagé sur une analyse fraîche, ce qui est le bon comportement par défaut.
 */
function isCompleteResult(result: BossResult): boolean {
  return result.topPlayers.length > 0 && result.character.damageTable.entries.length > 0;
}

/**
 * Lit un instantané, ou `null`.
 *
 * **Échoue ouvert** : Redis en panne, entrée absente, entrée illisible — tout rend `null` et
 * l'analyse repart chez Warcraft Logs. Un instantané est une optimisation ; le perdre doit
 * coûter des requêtes, jamais un rendu.
 *
 * Le `renderId` est **refrappé** à chaque lecture. C'est la seule clé de jointure du corpus
 * entre exposition, verdicts et conseils : rejouer celui qui a été stocké ferait converger
 * les étiquettes de tous les lecteurs du lien sur une exposition unique, et le corpus lirait
 * un seul rendu là où il y en a eu dix. Frappé ici plutôt que dans les routes pour que
 * l'appelant ne puisse pas l'oublier.
 */
export async function readSnapshot(key: string): Promise<BossResult | null> {
  try {
    const raw = await redisGet(key);
    if (!raw) return null;

    const result = JSON.parse(raw) as BossResult;
    if (typeof result?.encounterId !== 'number') return null;
    if (typeof result.character?.dps !== 'number') return null;
    if (!Array.isArray(result.topPlayers)) return null;
    if (!Array.isArray(result.character.damageTable?.entries)) return null;

    // Relue à la lecture et pas seulement contrôlée à l'écriture : un déploiement intermédiaire
    // qui aurait écrit un trou sous cette version le laisserait autrement servi jusqu'au bout
    // de sa durée de vie.
    if (!isCompleteResult(result)) return null;

    return { ...result, renderId: randomUUID() };
  } catch {
    return null;
  }
}

/**
 * Écrit un instantané, s'il est complet, avec une expiration explicite.
 *
 * Ne jette pas : l'analyse est faite et va être rendue ; la perdre parce que le cache a raté
 * serait le contraire de ce que le cache est censé faire.
 */
export async function writeSnapshot(key: string, result: BossResult): Promise<void> {
  if (!isCompleteResult(result)) return;

  const body = JSON.stringify(result);
  if (body.length > MAX_CACHED_BYTES) return;

  try {
    await redisSetEx(key, body, SNAPSHOT_TTL_SECONDS);
  } catch {
    // Ignoré volontairement : voir l'en-tête.
  }
}
