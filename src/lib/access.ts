import { consumeStrictQuota } from '@/lib/labels/rate-limit';
import {
  redisGet,
  redisHDel,
  redisHGet,
  redisHGetAll,
  redisHLen,
  redisHSet,
  redisSet,
} from '@/lib/redis';

/**
 * Qui entre dans LogLense, et par quelle porte.
 *
 * Trois portes, consultées dans cet ordre, et l'ordre est la sécurité du module :
 *
 * 1. **Les administrateurs**, en variable d'environnement. Jamais en Redis — une identité
 *    d'admin qui se lit dans la base se laisse écrire par qui sait y écrire, et la première
 *    écriture serait une auto-promotion.
 * 2. **La liste d'amorçage** (`BETA_ALLOWLIST`), en variable d'environnement elle aussi.
 *    Elle survit à la bascule vers Redis pour une seule raison : une panne d'Upstash ne doit
 *    pas pouvoir enfermer le propriétaire dehors de son propre produit.
 * 3. **Redis** : le mode d'accès, puis la liste nominative.
 *
 * Tout le reste échoue **fermé**. C'est la leçon écrite en tête de `redis.ts` : une panne de
 * Redis ne doit pas pouvoir se faire passer pour un état, et surtout pas pour « ouvert ».
 */

/** Le mode d'accès, la liste nominative, la file des demandes. Sans TTL : c'est de la donnée. */
export const ACCESS_MODE_KEY = 'access:mode';
export const ACCESS_MEMBERS_KEY = 'access:members';
export const ACCESS_PENDING_KEY = 'access:pending';

/**
 * Durée maximale d'une fenêtre ouverte, en jours.
 *
 * Une porte ouverte sans date de fermeture est une porte ouverte pour toujours : la seule
 * chose qui la referme est une action humaine, et personne ne pense à la faire. Le plafond
 * borne la faute de frappe autant que l'oubli — l'étape 5 du plan de saison ouvre sur deux
 * semaines, pas sur un trimestre.
 */
export const MAX_OPEN_DAYS = 30;

/**
 * Combien de demandes en attente la file accepte de retenir.
 *
 * La file est écrite depuis le rappel `signIn`, c'est-à-dire par quelqu'un qui n'est pas
 * encore admis : c'est la seule écriture du produit dont l'auteur n'a pas de session. Le
 * plafond est ce qui l'empêche de devenir une décharge. Un champ par battletag, donc
 * redemander n'ajoute rien ; il faut autant de comptes Battle.net distincts que d'entrées.
 */
export const MAX_PENDING = 500;

/** Demandes d'accès par heure et par battletag. Fermé : un compteur muet ne plafonne rien. */
export const ACCESS_REQUEST_PREFIX = 'ratelimit:access';
export const ACCESS_REQUEST_LIMIT = 5;

/**
 * La clé d'un battletag dans les hashs, et la seule forme comparable.
 *
 * Battle.net rend `Jumbaa#1234` mais la casse n'est pas significative : deux champs qui ne
 * diffèrent que par elle seraient deux membres distincts, dont un seul ouvrirait la porte.
 * La forme d'origine est conservée dans la valeur, pour l'écran.
 */
export function normaliseTag(battletag: string): string {
  return battletag.trim().toLowerCase();
}

/**
 * Dit si une chaîne a la forme d'un battletag.
 *
 * Borné en longueur avant tout : la valeur vient d'un corps de requête pour l'admission
 * manuelle, et un champ de hash sans borne est une écriture sans borne. Le motif reste
 * permissif sur le nom — Battle.net accepte l'accentué et le non-latin — et strict sur le
 * discriminant, qui est la seule partie dont la forme est garantie.
 */
export function isBattletag(value: string): boolean {
  return /^[^\s#]{2,32}#\d{3,10}$/u.test(value.trim());
}

function envTags(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((t) => normaliseTag(t))
    .filter(Boolean);
}

/**
 * Dit si ce battletag administre l'accès.
 *
 * Relue à chaque appel plutôt que figée à l'import : sur Vercel un module chargé survit à
 * plusieurs requêtes, et une liste calculée une fois ne verrait jamais un changement de
 * variable d'environnement.
 */
export function isAdminTag(battletag: string): boolean {
  const tag = normaliseTag(battletag);
  return tag !== '' && envTags('ADMIN_BATTLETAGS').includes(tag);
}

/** La liste d'amorçage : l'issue de secours quand Redis ne répond plus. */
export function isBootstrapTag(battletag: string): boolean {
  const tag = normaliseTag(battletag);
  return tag !== '' && envTags('BETA_ALLOWLIST').includes(tag);
}

export type AccessMode = 'closed' | 'open';

export interface AccessState {
  mode: AccessMode;
  /** Fin de la fenêtre, en ISO. `null` en mode fermé. */
  until: string | null;
  /** Vrai quand le mode dit « ouvert » mais que la date est passée. Lu comme fermé. */
  expired: boolean;
  setBy: string | null;
  setAt: string | null;
}

const CLOSED: AccessState = {
  mode: 'closed',
  until: null,
  expired: false,
  setBy: null,
  setAt: null,
};

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function parseState(raw: string | null, nowMs: number): AccessState {
  if (!raw) return CLOSED;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return CLOSED;
  }

  if (typeof parsed !== 'object' || parsed === null) return CLOSED;
  const rec = parsed as Record<string, unknown>;
  if (rec.mode !== 'open') return CLOSED;

  const until = typeof rec.until === 'string' ? rec.until : null;
  const endMs = until ? Date.parse(until) : Number.NaN;

  // Une fenêtre ouverte sans date lisible est traitée comme expirée, pas comme éternelle :
  // c'est « fermé par défaut » appliqué à une valeur qu'on ne sait pas relire.
  const expired = !Number.isFinite(endMs) || endMs <= nowMs;

  return {
    mode: 'open',
    until,
    expired,
    setBy: typeof rec.setBy === 'string' ? rec.setBy : null,
    setAt: typeof rec.setAt === 'string' ? rec.setAt : null,
  };
}

/** Lit le mode d'accès. Jette si Redis refuse — l'appelant décide, il ne devine pas. */
export async function readAccessState(nowMs = Date.now()): Promise<AccessState> {
  return parseState(await redisGet(ACCESS_MODE_KEY), nowMs);
}

/**
 * Ouvre la porte pour `days` jours, ou la referme.
 *
 * La date de fin vit **dans la valeur**, pas dans un TTL Redis. Deux raisons : l'écran
 * d'administration doit afficher « ouverte jusqu'au … », et ce client Redis n'a pas de verbe
 * `TTL` pour le relire. C'est aussi la doctrine de `redisSetEx` — ce qui porte un TTL est du
 * cache, or l'état de la porte est de la donnée.
 */
export async function setAccessMode(
  mode: AccessMode,
  days: number,
  by: string,
  nowMs = Date.now()
): Promise<AccessState> {
  if (mode === 'closed') {
    const closed = { mode: 'closed' as const, setBy: by, setAt: iso(nowMs) };
    await redisSet(ACCESS_MODE_KEY, JSON.stringify(closed));
    return { ...CLOSED, setBy: by, setAt: closed.setAt };
  }

  const clamped = Math.min(MAX_OPEN_DAYS, Math.max(1, Math.floor(days)));
  const value = {
    mode: 'open' as const,
    until: iso(nowMs + clamped * 86_400_000),
    setBy: by,
    setAt: iso(nowMs),
  };
  await redisSet(ACCESS_MODE_KEY, JSON.stringify(value));
  return { ...value, expired: false };
}

export interface Member {
  tag: string;
  admittedBy: string;
  admittedAt: string;
}

export interface PendingRequest {
  tag: string;
  requestedAt: string;
  attempts: number;
}

function str(rec: Record<string, unknown>, key: string): string {
  const value = rec[key];
  return typeof value === 'string' ? value : '';
}

/**
 * Replie un champ de hash en entrée typée.
 *
 * Une valeur illisible ne fait pas disparaître l'entrée : le **champ** est la vérité — c'est
 * lui que la connexion consulte — et la valeur n'en est que la trace. La masquer à l'écran
 * laisserait un membre admis que l'administrateur ne pourrait plus révoquer.
 */
function readRecord(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>;
  } catch {
    // Champ conservé, valeur perdue.
  }
  return {};
}

function toMember(field: string, raw: string): Member {
  const rec = readRecord(raw);
  return {
    tag: str(rec, 'tag') || field,
    admittedBy: str(rec, 'admittedBy'),
    admittedAt: str(rec, 'admittedAt'),
  };
}

function toPending(field: string, raw: string): PendingRequest {
  const rec = readRecord(raw);
  return {
    tag: str(rec, 'tag') || field,
    requestedAt: str(rec, 'requestedAt'),
    attempts: typeof rec.attempts === 'number' ? rec.attempts : 1,
  };
}

/** Les membres admis nominativement, du plus récent au plus ancien. */
export async function listMembers(): Promise<Member[]> {
  const hash = await redisHGetAll(ACCESS_MEMBERS_KEY);
  return Object.entries(hash)
    .map(([field, raw]) => toMember(field, raw))
    .sort((a, b) => b.admittedAt.localeCompare(a.admittedAt));
}

/** Les demandes en attente, la plus ancienne d'abord : une file se traite dans son ordre. */
export async function listPending(): Promise<PendingRequest[]> {
  const hash = await redisHGetAll(ACCESS_PENDING_KEY);
  return Object.entries(hash)
    .map(([field, raw]) => toPending(field, raw))
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
}

/**
 * Admet un battletag, et retire sa demande de la file.
 *
 * L'ordre compte : le membre est écrit avant que la demande ne soit retirée. Un échec entre
 * les deux laisse une demande déjà satisfaite dans la file — visible, corrigeable d'un clic.
 * L'ordre inverse laisserait quelqu'un sans accès et sans demande, donc invisible.
 */
export async function admit(battletag: string, by: string, nowMs = Date.now()): Promise<void> {
  const field = normaliseTag(battletag);
  await redisHSet(
    ACCESS_MEMBERS_KEY,
    field,
    JSON.stringify({ tag: battletag.trim(), admittedBy: by, admittedAt: iso(nowMs) })
  );
  await redisHDel(ACCESS_PENDING_KEY, field);
}

/** Retire un membre. Sans effet sur la liste d'amorçage, qui n'est pas en Redis. */
export async function revoke(battletag: string): Promise<void> {
  await redisHDel(ACCESS_MEMBERS_KEY, normaliseTag(battletag));
}

/** Écarte une demande sans admettre. */
export async function dismiss(battletag: string): Promise<void> {
  await redisHDel(ACCESS_PENDING_KEY, normaliseTag(battletag));
}

export type AccessReason =
  | 'admin'
  | 'bootstrap'
  | 'open-window'
  | 'member'
  | 'closed'
  | 'unavailable';

export interface AccessDecision {
  allowed: boolean;
  reason: AccessReason;
}

/**
 * Le verdict de la porte, pour un battletag.
 *
 * `unavailable` est distinct de `closed` parce que les deux appellent des suites différentes :
 * un refus par fermeture mérite d'être consigné comme demande, un refus par panne ne mérite
 * rien — Redis étant muet, l'écriture échouerait de toute façon.
 */
export async function decideAccess(battletag: string, nowMs = Date.now()): Promise<AccessDecision> {
  if (isAdminTag(battletag)) return { allowed: true, reason: 'admin' };
  if (isBootstrapTag(battletag)) return { allowed: true, reason: 'bootstrap' };

  try {
    const state = await readAccessState(nowMs);
    if (state.mode === 'open' && !state.expired) return { allowed: true, reason: 'open-window' };

    // `typeof === 'string'` et non `!== null` : c'est le côté fermant du test. Tout ce qui
    // n'est pas une valeur lue — `undefined` d'un client qui a mal répondu — vaut absence,
    // jamais appartenance.
    const member = await redisHGet(ACCESS_MEMBERS_KEY, normaliseTag(battletag));
    return typeof member === 'string' && member !== ''
      ? { allowed: true, reason: 'member' }
      : { allowed: false, reason: 'closed' };
  } catch {
    return { allowed: false, reason: 'unavailable' };
  }
}

/**
 * Consigne une demande d'accès, refusée à la porte.
 *
 * **Ne jette jamais** : elle est appelée depuis le rappel `signIn` de NextAuth, où une
 * exception ne produirait pas un refus propre mais une erreur d'authentification — le
 * visiteur verrait une panne là où il devrait lire « bêta fermée ».
 *
 * Deux bornes, parce que l'auteur de cette écriture n'a pas de session : un quota horaire par
 * battletag, fermé, et un plafond sur la taille de la file. Le quota est consulté en premier
 * pour que sonder la taille de la file coûte aussi un jeton.
 *
 * Rend `true` quand la demande est retenue.
 */
export async function requestAccess(battletag: string, nowMs = Date.now()): Promise<boolean> {
  const field = normaliseTag(battletag);
  if (field === '') return false;

  try {
    const verdict = await consumeStrictQuota(
      ACCESS_REQUEST_PREFIX,
      ACCESS_REQUEST_LIMIT,
      field,
      nowMs
    );
    if (!verdict.allowed) return false;

    const read = await redisHGet(ACCESS_PENDING_KEY, field);
    const existing = typeof read === 'string' && read !== '' ? read : null;

    // Le plafond ne s'applique qu'aux entrées neuves : renouveler une demande déjà là
    // n'agrandit pas la file, et la refuser figerait le compteur de tentatives — la seule
    // chose qui distingue un curieux d'un joueur qui insiste.
    if (existing === null && (await redisHLen(ACCESS_PENDING_KEY)) >= MAX_PENDING) return false;

    let attempts = 1;
    let firstSeen = iso(nowMs);
    if (existing !== null) {
      const prior = toPending(field, existing);
      attempts = prior.attempts + 1;
      // La date retenue est celle de la **première** demande : c'est elle qui ordonne la file,
      // et la rafraîchir renverrait au fond de la queue qui a le malheur de réessayer.
      if (prior.requestedAt !== '') firstSeen = prior.requestedAt;
    }

    await redisHSet(
      ACCESS_PENDING_KEY,
      field,
      JSON.stringify({ tag: battletag.trim(), requestedAt: firstSeen, attempts })
    );
    return true;
  } catch {
    return false;
  }
}
