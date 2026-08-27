import { redisExpire, redisIncrBy } from '@/lib/redis';

/** Verdicts par heure et par compte. Un joueur qui juge honnêtement n'approche pas ce seuil. */
export const LABEL_LIMIT = 60;

/**
 * Expositions par heure et par compte. Plus haut que les verdicts : une analyse écrit un
 * enregistrement par boss, et parcourir un raid entier en produit légitimement des dizaines.
 * Le seuil borne l'abus, il ne rationne pas l'usage.
 */
export const EXPOSURE_LIMIT = 120;

/**
 * Rapports IA par heure et par compte, **sur la clé serveur uniquement**. Bien plus bas que
 * les deux précédents : ceux-là bornent des écritures, celui-ci borne une dépense réelle.
 */
export const AI_LIMIT = 20;

/**
 * Appels Warcraft Logs par heure et par compte — des unités, pas des requêtes HTTP.
 *
 * Une analyse de boss en vaut une cinquantaine, une lecture de métadonnées une seule : le
 * plafond porte sur ce qui est dépensé chez WCL, pas sur ce qui entre chez nous. Deux mille
 * unités, c'est une quarantaine de boss par heure — largement au-delà d'un raid entier relu
 * sur plusieurs specs, très en deçà de ce qu'un script tirerait. La sanction d'en face est
 * discrétionnaire et porte sur la clé : le plafond doit mordre avant elle.
 */
export const WCL_UNIT_LIMIT = 2000;

/**
 * Appels Warcraft Logs par heure, **tous comptes confondus**.
 *
 * `WCL_UNIT_LIMIT` borne un compte ; il ne compose pas. Dix bêta-testeurs, c'est vingt mille
 * unités par heure sans qu'aucun d'eux n'ait rien fait d'anormal. Et la sanction d'en face est
 * discrétionnaire et porte sur la clé : elle arrête le produit entier, pas le compte fautif.
 * Ce second plafond est le seul qui borne ce que Warcraft Logs voit réellement.
 *
 * Trois fois le plafond individuel : trois raiders peuvent brûler leur quota personnel entier
 * avant que le partagé ne morde, ce qui laisse l'usage normal tranquille et coupe l'emballement
 * collectif. **Le chiffre est à recalibrer sur le budget réel du client WCL** — il est posé sur
 * l'ordre de grandeur d'une bêta à dix, pas sur un relevé d'en face.
 */
export const WCL_GLOBAL_UNIT_LIMIT = 6000;

/**
 * Le sujet du compteur partagé, dans le même préfixe que les compteurs par compte.
 *
 * Aucune collision possible : `quotaSubject` rend toujours trente-deux caractères hexadécimaux,
 * jamais ce littéral. Partager le préfixe garde les deux compteurs sur la même fenêtre et la
 * même durée de vie — c'est ce qui rend le règlement identique pour l'un et pour l'autre.
 */
export const WCL_GLOBAL_SUBJECT = 'all';

/** Préfixes de compteur. Quatre quotas distincts : saturer l'un ne doit pas fermer les autres. */
export const LABEL_PREFIX = 'ratelimit:labels';
export const EXPOSURE_PREFIX = 'ratelimit:exposure';
export const AI_PREFIX = 'ratelimit:ai';
export const WCL_PREFIX = 'ratelimit:wcl';

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
 *
 * `cost` est le nombre d'unités que la requête consomme. Il est ajouté avant la comparaison,
 * donc une requête qui déborde le plafond l'a déjà payé : le compteur intègre son coût même
 * refusée. C'est voulu — décompter après coup demanderait un second aller-retour, et la
 * fenêtre se remet à zéro d'elle-même.
 */
export async function consumeQuota(
  prefix: string,
  limit: number,
  by: string,
  atMs: number,
  cost = 1
): Promise<RateVerdict> {
  const key = quotaKey(prefix, by, atMs);
  const windowSeconds = Math.ceil(WINDOW_MS / 1000);
  const retryAfterSeconds = Math.max(1, Math.ceil((WINDOW_MS - (atMs % WINDOW_MS)) / 1000));

  let count: number;
  try {
    count = await redisIncrBy(key, cost);
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

export interface StrictVerdict extends RateVerdict {
  /** Vrai quand le refus vient d'un compteur illisible, pas d'un plafond atteint. */
  unavailable: boolean;
  /**
   * Ce que le compteur totalise sur la fenêtre, coût de cette requête compris.
   *
   * `null` — et non `0` — quand l'`INCRBY` n'a pas répondu : rien n'a été lu, donc rien n'est
   * su. La distinction porte parce que ce champ n'existe que pour être agrégé en distribution
   * de demande, et qu'un coût réellement nul est représentable : `guardWclSpend` facturera un
   * jour moins cher une analyse servie par le cache. Confondre « mesuré à zéro » et « pas
   * mesuré » fausserait alors la seule courbe qu'on cherche à lire.
   */
  consumed: number | null;
}

/**
 * Consomme un jeton d'un quota horaire, **en échouant fermé**.
 *
 * Le pendant de `consumeQuota` pour ce qui dépense au lieu d'écrire. Là-bas, Redis muet
 * laisse passer parce que la donnée non capturée est perdue ; ici, Redis muet ferme le
 * robinet, parce qu'une dépense non comptée est une dépense sans plafond.
 *
 * Un `EXPIRE` manqué refuse lui aussi : la clé porte l'index de sa fenêtre, donc un compteur
 * resté sans durée de vie ne coûte que l'heure en cours — jamais un compte verrouillé.
 */
export async function consumeStrictQuota(
  prefix: string,
  limit: number,
  by: string,
  atMs: number,
  cost = 1
): Promise<StrictVerdict> {
  const key = quotaKey(prefix, by, atMs);
  const windowSeconds = Math.ceil(WINDOW_MS / 1000);
  const retryAfterSeconds = Math.max(1, Math.ceil((WINDOW_MS - (atMs % WINDOW_MS)) / 1000));

  let count: number;
  try {
    count = await redisIncrBy(key, cost);
  } catch {
    return { allowed: false, retryAfterSeconds, unavailable: true, consumed: null };
  }

  try {
    await redisExpire(key, windowSeconds);
  } catch {
    // Le refus est le même que ci-dessus, la mesure non : l'incrément, lui, a répondu, donc
    // `count` est un relevé vrai. Le jeter parce que la commande *suivante* a échoué perdrait
    // une donnée qu'on tient déjà — et c'est `unavailable` qui dit que le verdict n'est pas
    // garanti, pas `consumed`.
    return { allowed: false, retryAfterSeconds, unavailable: true, consumed: count };
  }

  return count > limit
    ? { allowed: false, retryAfterSeconds, unavailable: false, consumed: count }
    : { allowed: true, retryAfterSeconds: 0, unavailable: false, consumed: count };
}

export function consumeAiQuota(by: string, atMs: number): Promise<StrictVerdict> {
  return consumeStrictQuota(AI_PREFIX, AI_LIMIT, by, atMs);
}

/**
 * Consomme `units` du budget Warcraft Logs horaire d'un compte.
 *
 * Strict comme le quota IA, et pour la même raison : ce qui n'est pas compté n'est pas
 * plafonné. La différence est que la dépense n'est pas ici de l'argent mais du crédit chez
 * un tiers dont la sanction — la révocation de la clé — arrête le produit entier.
 */
export function consumeWclQuota(by: string, atMs: number, units: number): Promise<StrictVerdict> {
  return consumeStrictQuota(WCL_PREFIX, WCL_UNIT_LIMIT, by, atMs, units);
}

/**
 * Consomme `units` du budget Warcraft Logs horaire **partagé par tous les comptes**.
 *
 * À consommer *après* le quota du compte, jamais avant : un appelant déjà au-delà de son
 * plafond personnel continuerait sinon de gonfler le compteur commun à chaque tentative — et
 * comme un refus n'est jamais réglé, un seul utilisateur qui martèle fermerait la porte à tous
 * les autres. L'ordre inverse coûte à celui qui déborde un débit personnel pour une requête que
 * le plafond commun refusera ; la fenêtre se remet à zéro toute seule, et ce module accepte
 * déjà cette classe d'imprécision.
 */
export function consumeWclGlobalQuota(atMs: number, units: number): Promise<StrictVerdict> {
  return consumeStrictQuota(WCL_PREFIX, WCL_GLOBAL_UNIT_LIMIT, WCL_GLOBAL_SUBJECT, atMs, units);
}

/**
 * Corrige après coup ce qu'une requête a réellement dépensé chez Warcraft Logs.
 *
 * `consumeWclQuota` réserve un forfait avant la première requête — il le doit, c'est le seul
 * instant où le plafond borne quelque chose. Mais une analyse servie par les caches de
 * référence coûte une poignée d'appels au lieu de quatre-vingt-dix : sans règlement, le
 * quota de l'utilisateur fondrait au tarif plein pour une dépense qui n'a pas eu lieu, et
 * l'économie du cache n'irait qu'à la facture WCL, jamais au produit.
 *
 * `delta` est signé. Négatif, il rend le trop-réservé ; positif, il facture le dépassement —
 * sans quoi un plafond cesserait d'être un plafond dès qu'une analyse déborde son forfait.
 * Le compteur ne peut pas passer sous zéro pour autant : chaque requête ne retire que ce
 * qu'elle a elle-même ajouté.
 *
 * `atMs` est l'instant de la **réservation**, pas celui du règlement. La clé porte l'index
 * de sa fenêtre : régler avec l'heure courante créditerait la fenêtre suivante d'un
 * remboursement que seule la précédente a payé.
 *
 * Ne jette jamais, et ne pose pas d'`EXPIRE` : la clé en a déjà un, posé par la réservation
 * qui l'a créée. Un règlement perdu laisse simplement l'appelant au tarif nominal — le
 * défaut sûr, du même côté que le reste de ce module.
 */
export async function settleWclQuota(by: string, atMs: number, delta: number): Promise<void> {
  if (delta === 0) return;

  try {
    await redisIncrBy(quotaKey(WCL_PREFIX, by, atMs), delta);
  } catch {
    // Avalé volontairement : voir l'en-tête.
  }
}

/**
 * Le même règlement, sur le compteur partagé. Même delta, signé de la même façon : sans lui, le
 * forfait de quatre-vingt-dix unités gonflerait le plafond commun au tarif plein, et celui-ci
 * mordrait sur une dépense qui n'a pas eu lieu — pour tout le monde à la fois.
 */
export function settleWclGlobalQuota(atMs: number, delta: number): Promise<void> {
  return settleWclQuota(WCL_GLOBAL_SUBJECT, atMs, delta);
}
