import type { CombatantEvent } from './combatant';
import type { EligibilityProfile } from './eligibility';
import type { CharacterStats, DamageEntry, FightTarget, RotationSummary } from '@/types';
import { createHash } from 'node:crypto';
import { redisGet, redisMGet, redisSetEx } from '@/lib/redis';
import { OFFENSIVE_EXTERNALS } from './eligibility';

/**
 * Durée de vie des deux caches de référence.
 *
 * Vingt-quatre heures, comme `PARTITION_TTL_SECONDS` et pour la même raison — pas parce que
 * la donnée vieillit. Un combat passé ne change plus : ni son `CombatantInfo`, ni sa table
 * de buffs, ni ses dégâts. Le TTL n'est donc pas une fraîcheur, c'est la frontière légale.
 * Ce qui expire est une copie de travail ; ce qui n'expire pas serait la base de données
 * permanente que les CGU de Warcraft Logs refusent.
 */
export const REFERENCE_TTL_SECONDS = 24 * 60 * 60;

const VERIFICATION_CACHE_VERSION = 'v1';
const FIGHT_DATA_CACHE_VERSION = 'v2';

/**
 * Plafond de taille d'une entrée. Bien plus bas que celui du vivier : ici on écrit un
 * combattant ou une table de dégâts, pas dix pages de classement. Une entrée qui le dépasse
 * est une anomalie qu'on préfère ne pas propager pour vingt-quatre heures.
 */
const MAX_CACHED_BYTES = 400_000;

/**
 * Ce que la vérification d'un candidat produit, moins ce qui dépend du demandeur.
 *
 * `eligibilityOf` ne lit que le combattant, sa table de buffs et la durée du combat : rien
 * de tout cela ne connaît celui qui demande l'analyse. Le profil est donc partageable entre
 * utilisateurs. `disqualify(profile, mine)`, lui, compare au demandeur — il reste calculé à
 * chaud, hors du cache, sans quoi le premier arrivant figerait son verdict pour les autres.
 *
 * `aurasRead` est la métadonnée de complétude, à l'image de `pagesFetched` sur le vivier :
 * la valeur porte de quoi juger si elle vaut d'être servie. Voir `isCompleteVerification`.
 */
export interface CachedVerification {
  combatant: CombatantEvent;
  profile: EligibilityProfile;
  /** Nombre d'auras vues sur la table de buffs qui a produit `profile`. */
  aurasRead: number;
}

/** Les quatre champs de `fetchFightData` qu'une référence consomme. Le reste n'est pas lu. */
export interface CachedFightData {
  stats: CharacterStats;
  rotation: RotationSummary;
  damageEntries: DamageEntry[];
  fightTargets: FightTarget[];
}

/**
 * Empreinte des sorts qui comptent comme externals offensifs.
 *
 * La clé porte cette empreinte parce que la table est une *entrée* du profil mis en cache :
 * ajouter un sort à `OFFENSIVE_EXTERNALS` change ce que `externalsOf` mesure, et les entrées
 * écrites avant l'ajout mesurent autre chose. Sans empreinte, elles resteraient servies
 * jusqu'à expiration, et le sort ajouté ne disqualifierait personne pendant une journée.
 *
 * `EXTERNAL_TOLERANCE`, en revanche, n'y entre pas : elle est appliquée par `disqualify`,
 * qui reste sur le chemin chaud. La nommer ici documenterait une dépendance qui n'existe
 * pas.
 *
 * Recalculée à chaque appel plutôt que mémoïsée : un sha256 sur trente octets ne pèse rien
 * face à l'aller-retour Redis qu'il précède, et une empreinte figée au chargement du module
 * mentirait au premier test qui fait bouger la table.
 */
function externalsFingerprint(): string {
  const guids = Object.keys(OFFENSIVE_EXTERNALS)
    .map(Number)
    .sort((a, b) => a - b)
    .join(',');
  return createHash('sha256').update(guids).digest('hex').slice(0, 8);
}

/**
 * Clé de vérification d'un candidat.
 *
 * Le nom du personnage passe en dernier : c'est le seul champ que nous ne formons pas
 * nous-mêmes, et le mettre au milieu laisserait un nom exotique déborder sur le champ
 * suivant. Ni utilisateur ni spec n'y figurent — deux joueurs de la même spec qui tombent
 * sur le même candidat vérifient exactement la même chose.
 */
export function verificationCacheKey(args: {
  code: string;
  fightID: number;
  name: string;
}): string {
  const { code, fightID, name } = args;
  return `wcl:verify:${VERIFICATION_CACHE_VERSION}:${externalsFingerprint()}:${code}:${fightID}:${name}`;
}

/**
 * Clé des dégâts et de la rotation d'une référence.
 *
 * `(rapport, combat, acteur)` suffit. `fetchFightData` prend aussi `dps` et `fightMs`, mais
 * les deux viennent du classement et sont invariants pour un combat donné : le total de
 * dégâts d'un joueur dans une pull passée ne bouge plus, sa durée non plus.
 */
export function fightDataCacheKey(args: {
  code: string;
  fightID: number;
  sourceID: number;
}): string {
  const { code, fightID, sourceID } = args;
  return `wcl:fight:${FIGHT_DATA_CACHE_VERSION}:${code}:${fightID}:${sourceID}`;
}

/**
 * Une vérification n'est écrite que complète. Deux trous, et le même piège derrière chacun.
 *
 * `tierPieces` vaut `null` quand le `CombatantInfo` est arrivé sans équipement, et une table
 * de buffs sans aucune aura est un rapport amputé, pas un joueur sans buff — `Q_BUFFS` ne
 * filtre sur rien, et un raideur porte toujours flacon, nourriture et buffs de raid.
 *
 * Or `disqualify` ne disqualifie **jamais** sur un trou : `null` sur le set bonus n'écarte
 * personne, et une table vide se lit comme zéro seconde d'external. Mettre un trou en cache
 * ne perdrait donc pas une élimination pour un utilisateur, mais promouvrait un candidat qui
 * devait être écarté — pour tous les utilisateurs de cette spec, pendant tout le TTL.
 */
function isCompleteVerification(entry: CachedVerification): boolean {
  return entry.profile.tierPieces !== null && entry.aurasRead > 0;
}

/** Un joueur classé a fait des dégâts. Une table vide est une requête ratée, pas un combat. */
function isCompleteFightData(entry: CachedFightData): boolean {
  return entry.damageEntries.length > 0;
}

function parseVerification(raw: string | null): CachedVerification | null {
  if (!raw) return null;

  try {
    const entry = JSON.parse(raw) as CachedVerification;
    if (typeof entry?.aurasRead !== 'number') return null;

    const { combatant, profile } = entry;
    if (typeof combatant?.sourceID !== 'number') return null;
    if (typeof profile?.externalUptime !== 'number') return null;
    if (profile.tierPieces !== null && typeof profile.tierPieces !== 'number') return null;
    if (!Array.isArray(profile.externals)) return null;

    // Relu à la lecture et pas seulement contrôlé à l'écriture : un déploiement intermédiaire
    // qui aurait écrit un trou sous cette version le laisserait autrement servi jusqu'au bout
    // de sa durée de vie.
    return isCompleteVerification(entry) ? entry : null;
  } catch {
    return null;
  }
}

function parseFightData(raw: string | null): CachedFightData | null {
  if (!raw) return null;

  try {
    const entry = JSON.parse(raw) as CachedFightData;
    if (typeof entry?.stats !== 'object' || entry.stats === null) return null;
    if (typeof entry.rotation !== 'object' || entry.rotation === null) return null;
    if (!Array.isArray(entry.damageEntries)) return null;
    // Le champ est arrivé avec la version `v2` de la clé : une entrée qui ne le porte pas
    // vient d'une écriture qu'on ne sait pas dater, et un tableau de cibles absent se lirait
    // comme un combat sans cible.
    if (!Array.isArray(entry.fightTargets)) return null;

    return isCompleteFightData(entry) ? entry : null;
  } catch {
    return null;
  }
}

/**
 * Lit toute la fenêtre de vérification en une commande.
 *
 * Rend un tableau aligné sur `keys` : une entrée par clé, `null` quand le cache est muet.
 * **Échoue ouvert** — Redis en panne rend une fenêtre de `null`, et l'analyse repart chez
 * Warcraft Logs comme si le cache n'existait pas. Un cache est une optimisation ; le perdre
 * doit coûter des requêtes, jamais une analyse.
 */
export async function readCachedVerifications(
  keys: string[]
): Promise<(CachedVerification | null)[]> {
  try {
    return (await redisMGet(keys)).map(parseVerification);
  } catch {
    return keys.map(() => null);
  }
}

/** Même contrat de lecture, sur une seule clé : les trois références sont déjà parallèles. */
export async function readCachedFightData(key: string): Promise<CachedFightData | null> {
  try {
    return parseFightData(await redisGet(key));
  } catch {
    return null;
  }
}

/**
 * Écrit une vérification, si elle est complète, avec une expiration explicite.
 *
 * Ne jette pas : la vérification est déjà faite, la perdre pour un cache raté serait le
 * contraire de ce que le cache est censé faire.
 */
export async function writeCachedVerification(
  key: string,
  entry: CachedVerification
): Promise<void> {
  if (!isCompleteVerification(entry)) return;

  const body = JSON.stringify(entry);
  if (body.length > MAX_CACHED_BYTES) return;

  try {
    await redisSetEx(key, body, REFERENCE_TTL_SECONDS);
  } catch {
    // Ignoré volontairement : voir l'en-tête.
  }
}

/** Même contrat d'écriture, sur les dégâts et la rotation d'une référence. */
export async function writeCachedFightData(key: string, entry: CachedFightData): Promise<void> {
  if (!isCompleteFightData(entry)) return;

  const body = JSON.stringify(entry);
  if (body.length > MAX_CACHED_BYTES) return;

  try {
    await redisSetEx(key, body, REFERENCE_TTL_SECONDS);
  } catch {
    // Ignoré volontairement : voir l'en-tête.
  }
}
