import type { ComparabilityLevel } from '@/lib/wcl/comparability';

export const LABEL_REASONS = ['externals', 'set-bonus', 'kill-time', 'ilvl', 'other'] as const;
export type LabelReason = (typeof LABEL_REASONS)[number];

const LEVELS: ComparabilityLevel[] = ['close', 'approximate', 'poor', 'none'];

/** Ce que le client envoie. Il ne choisit ni qui il est ni quand cela s'est produit. */
export interface LabelSubmission {
  reason: LabelReason;
  encounterId: number;
  difficulty: number;
  specId: number;
  subject: { code: string; fightID: number; actorId: number; ilvl: number; killTimeMs: number };
  reference: {
    code: string;
    fightID: number;
    name: string;
    ilvl: number | null;
    killTimeMs: number;
    dps: number;
  };
  /** Écarts signés, référence − sujet. */
  scores: { distance: number; ilvlGap: number | null; killTimeGapPct: number; rank: number };
  pool: { candidatesConsidered: number; pagesFetched: number; level: ComparabilityLevel };
}

/**
 * Ce qui est écrit dans le corpus.
 *
 * `v` n'est pas décoratif : le corpus survivra à plusieurs versions du code, et sans lui
 * on ne saura plus dans un an ce que signifiaient les enregistrements d'aujourd'hui.
 */
export interface ComparabilityLabel extends LabelSubmission {
  v: 1;
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

function str(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
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

  if (!isRecord(reference)) return null;
  if (!str(reference.code) || !num(reference.fightID) || !str(reference.name)) return null;
  if (!nullableNum(reference.ilvl) || !num(reference.killTimeMs) || !num(reference.dps))
    return null;

  if (!isRecord(scores)) return null;
  if (!num(scores.distance) || !nullableNum(scores.ilvlGap)) return null;
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
    },
    reference: {
      code: reference.code,
      fightID: reference.fightID,
      name: reference.name,
      ilvl: reference.ilvl,
      killTimeMs: reference.killTimeMs,
      dps: reference.dps,
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
