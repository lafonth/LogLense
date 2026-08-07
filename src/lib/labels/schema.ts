import type { DisqualificationReason } from '@/lib/wcl/eligibility';
import { DISQUALIFICATION_REASONS } from '@/lib/wcl/eligibility';

export const LABEL_REASONS = ['externals', 'set-bonus', 'kill-time', 'ilvl', 'other'] as const;
export type LabelReason = (typeof LABEL_REASONS)[number];

/**
 * Plafond du nombre de motifs de disqualification recopiés.
 *
 * Il y en a deux ; le plafond borne ce qu'un client hostile peut faire écrire dans une clé
 * qu'on ne peut pas nettoyer après coup, pas ce qu'un client honnête envoie.
 */
const MAX_DISQUALIFIED = DISQUALIFICATION_REASONS.length;

/**
 * Ce que le client envoie. Il ne choisit ni qui il est ni quand cela s'est produit.
 *
 * Le verdict n'est plus autoportant : le vivier, le niveau de comparabilité et les mesures
 * des deux côtés vivent dans l'exposition que `renderId` désigne. Ne restent ici que le
 * jugement, ses pointeurs, et de quoi rester lisible si l'exposition n'a pas pu être écrite.
 */
export interface LabelSubmission {
  /**
   * Le rendu contesté, tel que le serveur l'a posé sur le `BossResult`.
   *
   * C'est la jointure avec l'exposition : sans lui, un refus ne se rattache à rien et ne se
   * déduplique pas, et le positif faible — montré, contestable, non contesté — ne se dérive
   * plus. Obligatoire pour cette raison.
   */
  renderId: string;
  reason: LabelReason;
  /**
   * Redondants avec l'exposition, et gardés quand même : une exposition peut avoir manqué
   * son écriture, et un verdict orphelin doit rester exploitable seul.
   */
  encounterId: number;
  difficulty: number;
  specId: number;
  /** Pointeurs seuls : les mesures se réhydratent depuis WCL, elles ne se recopient plus. */
  subject: { code: string; fightID: number; actorId: number };
  reference: {
    code: string;
    fightID: number;
    /** Le pointeur qui remplace le nom — §5c des CGU : aucun nom de tiers dans le corpus. */
    actorId: number;
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
   * Conservés là où les mesures brutes disparaissent : ce sont les jugements que LogLense a
   * portés sur un vivier qui n'existera plus dans un mois. Ils ne se recalculent pas.
   *
   * `distance` est `null` quand la sélection n'a pas pu la calculer — pas de `bracketData`
   * sur l'entrée de classement, ou pas d'ilvl pour le sujet. C'est une information, pas une
   * absence : c'est justement le cas où la comparaison est illégitime, donc celui où
   * l'étiquette vaut le plus. La refuser reviendrait à ne capturer que les cas faciles.
   */
  scores: { distance: number | null; ilvlGap: number | null; killTimeGapPct: number; rank: number };
}

/**
 * Ce qui est écrit dans le corpus.
 *
 * `v` n'est pas décoratif : le corpus survivra à plusieurs versions du code, et sans lui
 * on ne saura plus dans un an ce que signifiaient les enregistrements d'aujourd'hui.
 *
 * `3` depuis le passage aux pointeurs — les enregistrements `2` portent des mesures WCL
 * recopiées, les `3` les réhydratent. La version est une convention de corpus et non un
 * compteur par type : expositions et verdicts la portent ensemble, et elle dit la même
 * chose des deux.
 */
export interface ComparabilityLabel extends LabelSubmission {
  v: 3;
  /** La contrepartie de `kind: 'exposure'` : un jugement énoncé, pas un silence. */
  kind: 'verdict';
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
 * Aucun champ légitime n'en approche : un code de rapport fait 16 caractères, un UUID de
 * rendu 36. Le plafond n'est pas là pour les cadrer au plus juste mais pour empêcher qu'une
 * session valide gonfle indéfiniment un corpus qu'on ne peut pas nettoyer après coup.
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
 * serveur possède — `v`, `kind`, `at`, `by` — ne sont jamais repris de l'entrée.
 */
export function parseSubmission(input: unknown): LabelSubmission | null {
  if (!isRecord(input)) return null;

  const { renderId, reason, encounterId, difficulty, specId, subject, reference, scores } = input;

  // Un verdict sans rendu ne se joint à rien : refusé, plutôt qu'écrit orphelin par nature.
  if (!str(renderId)) return null;
  if (!str(reason) || !(LABEL_REASONS as readonly string[]).includes(reason)) return null;
  if (!num(encounterId) || !num(difficulty) || !num(specId)) return null;

  if (!isRecord(subject)) return null;
  if (!str(subject.code) || !num(subject.fightID) || !num(subject.actorId)) return null;

  if (!isRecord(reference)) return null;
  if (!str(reference.code) || !num(reference.fightID) || !num(reference.actorId)) return null;
  if (!reasons(reference.disqualifiedBy)) return null;

  if (!isRecord(scores)) return null;
  if (!nullableNum(scores.distance) || !nullableNum(scores.ilvlGap)) return null;
  if (!num(scores.killTimeGapPct) || !num(scores.rank)) return null;

  return {
    renderId,
    reason: reason as LabelReason,
    encounterId,
    difficulty,
    specId,
    subject: {
      code: subject.code,
      fightID: subject.fightID,
      actorId: subject.actorId,
    },
    reference: {
      code: reference.code,
      fightID: reference.fightID,
      actorId: reference.actorId,
      disqualifiedBy: [...reference.disqualifiedBy],
    },
    scores: {
      distance: scores.distance,
      ilvlGap: scores.ilvlGap,
      killTimeGapPct: scores.killTimeGapPct,
      rank: scores.rank,
    },
  };
}

/** `2026-08-06T09:14:22.000Z` → `labels:comparability:2026-08`. */
export function monthKey(isoTimestamp: string): string {
  return `labels:comparability:${isoTimestamp.slice(0, 7)}`;
}
