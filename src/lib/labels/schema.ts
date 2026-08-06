import type { ComparabilityLevel } from '@/lib/wcl/comparability';
import type { DisqualificationReason } from '@/lib/wcl/eligibility';
import { DISQUALIFICATION_REASONS } from '@/lib/wcl/eligibility';

export const LABEL_REASONS = ['externals', 'set-bonus', 'kill-time', 'ilvl', 'other'] as const;
export type LabelReason = (typeof LABEL_REASONS)[number];

const LEVELS: ComparabilityLevel[] = ['close', 'approximate', 'poor', 'none'];

/**
 * Plafond du nombre de motifs de disqualification recopiés.
 *
 * Il y en a deux ; le plafond borne ce qu'un client hostile peut faire écrire dans une clé
 * qu'on ne peut pas nettoyer après coup, pas ce qu'un client honnête envoie.
 */
const MAX_DISQUALIFIED = DISQUALIFICATION_REASONS.length;

/** Ce que le client envoie. Il ne choisit ni qui il est ni quand cela s'est produit. */
export interface LabelSubmission {
  reason: LabelReason;
  encounterId: number;
  difficulty: number;
  specId: number;
  /**
   * `tierPieces` est `null` quand le log ne porte pas d'équipement — inconnu, et non zéro.
   * Les deux côtés le portent : un jugement « set bonus » ne se relit pas sans le palier du
   * sujet en face de celui de la référence.
   */
  subject: {
    code: string;
    fightID: number;
    actorId: number;
    ilvl: number;
    killTimeMs: number;
    tierPieces: number | null;
    externalUptime: number;
  };
  reference: {
    code: string;
    fightID: number;
    name: string;
    ilvl: number | null;
    killTimeMs: number;
    dps: number;
    tierPieces: number | null;
    externalUptime: number;
    /**
     * Ce que la sélection avait retenu contre cette référence, vide si elle avait qualifié.
     *
     * C'est la moitié la plus précieuse de l'étiquette : elle confronte le jugement
     * automatique au jugement humain. Un désaccord entre les deux — retenue par le code,
     * rejetée par le lecteur, ou l'inverse — est précisément ce qu'un modèle doit apprendre.
     */
    disqualifiedBy: DisqualificationReason[];
  };
  /**
   * Écarts signés, référence − sujet.
   *
   * `distance` est `null` quand la sélection n'a pas pu la calculer — pas de `bracketData`
   * sur l'entrée de classement, ou pas d'ilvl pour le sujet. C'est une information, pas une
   * absence : c'est justement le cas où la comparaison est illégitime, donc celui où
   * l'étiquette vaut le plus. La refuser reviendrait à ne capturer que les cas faciles.
   */
  scores: { distance: number | null; ilvlGap: number | null; killTimeGapPct: number; rank: number };
  pool: { candidatesConsidered: number; pagesFetched: number; level: ComparabilityLevel };
}

/**
 * Ce qui est écrit dans le corpus.
 *
 * `v` n'est pas décoratif : le corpus survivra à plusieurs versions du code, et sans lui
 * on ne saura plus dans un an ce que signifiaient les enregistrements d'aujourd'hui.
 *
 * `2` depuis l'ajout des critères éliminatoires — palier de set et uptime d'externals des
 * deux côtés, et le verdict de la sélection. Les enregistrements `1` ne les portent pas ;
 * c'est une absence de mesure, pas une valeur nulle, et seul `v` permet de le savoir.
 */
export interface ComparabilityLabel extends LabelSubmission {
  v: 2;
  at: string;
  /** SHA-256 salé de l'identifiant de session. Jamais l'e-mail. */
  by: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function nullableNum(v: unknown): v is number | null {
  return v === null || num(v);
}

/**
 * Plafond de longueur de chaîne.
 *
 * Aucun champ légitime n'en approche : un code de rapport fait 16 caractères, un nom de
 * personnage 12. Le plafond n'est pas là pour les cadrer au plus juste mais pour empêcher
 * qu'une session valide gonfle indéfiniment un corpus qu'on ne peut pas nettoyer après coup.
 */
export const MAX_FIELD_LENGTH = 64;

function str(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_FIELD_LENGTH;
}

/** Motifs de disqualification : bornés en nombre, sans doublon, tous connus. */
function reasons(v: unknown): v is DisqualificationReason[] {
  if (!Array.isArray(v) || v.length > MAX_DISQUALIFIED) return false;
  if (new Set(v).size !== v.length) return false;
  return v.every((r) => (DISQUALIFICATION_REASONS as readonly unknown[]).includes(r));
}

/**
 * Valide un corps entrant champ par champ et renvoie une soumission propre, ou `null`.
 *
 * Le corps arrive du navigateur et finit dans un corpus permanent qu'on ne peut pas
 * nettoyer après coup : rien n'est recopié sans avoir été vérifié, et les champs que le
 * serveur possède — `v`, `at`, `by` — ne sont jamais repris de l'entrée.
 */
export function parseSubmission(input: unknown): LabelSubmission | null {
  if (!isRecord(input)) return null;

  const { reason, encounterId, difficulty, specId, subject, reference, scores, pool } = input;

  if (!str(reason) || !(LABEL_REASONS as readonly string[]).includes(reason)) return null;
  if (!num(encounterId) || !num(difficulty) || !num(specId)) return null;

  if (!isRecord(subject)) return null;
  if (!str(subject.code) || !num(subject.fightID) || !num(subject.actorId)) return null;
  if (!num(subject.ilvl) || !num(subject.killTimeMs)) return null;
  if (!nullableNum(subject.tierPieces) || !num(subject.externalUptime)) return null;

  if (!isRecord(reference)) return null;
  if (!str(reference.code) || !num(reference.fightID) || !str(reference.name)) return null;
  if (!nullableNum(reference.ilvl) || !num(reference.killTimeMs) || !num(reference.dps))
    return null;
  if (!nullableNum(reference.tierPieces) || !num(reference.externalUptime)) return null;
  if (!reasons(reference.disqualifiedBy)) return null;

  if (!isRecord(scores)) return null;
  if (!nullableNum(scores.distance) || !nullableNum(scores.ilvlGap)) return null;
  if (!num(scores.killTimeGapPct) || !num(scores.rank)) return null;

  if (!isRecord(pool)) return null;
  if (!num(pool.candidatesConsidered) || !num(pool.pagesFetched)) return null;
  if (!str(pool.level) || !(LEVELS as string[]).includes(pool.level)) return null;

  return {
    reason: reason as LabelReason,
    encounterId,
    difficulty,
    specId,
    subject: {
      code: subject.code,
      fightID: subject.fightID,
      actorId: subject.actorId,
      ilvl: subject.ilvl,
      killTimeMs: subject.killTimeMs,
      tierPieces: subject.tierPieces,
      externalUptime: subject.externalUptime,
    },
    reference: {
      code: reference.code,
      fightID: reference.fightID,
      name: reference.name,
      ilvl: reference.ilvl,
      killTimeMs: reference.killTimeMs,
      dps: reference.dps,
      tierPieces: reference.tierPieces,
      externalUptime: reference.externalUptime,
      disqualifiedBy: [...reference.disqualifiedBy],
    },
    scores: {
      distance: scores.distance,
      ilvlGap: scores.ilvlGap,
      killTimeGapPct: scores.killTimeGapPct,
      rank: scores.rank,
    },
    pool: {
      candidatesConsidered: pool.candidatesConsidered,
      pagesFetched: pool.pagesFetched,
      level: pool.level as ComparabilityLevel,
    },
  };
}

/** `2026-08-06T09:14:22.000Z` → `labels:comparability:2026-08`. */
export function monthKey(isoTimestamp: string): string {
  return `labels:comparability:${isoTimestamp.slice(0, 7)}`;
}
