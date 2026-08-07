import type { PromptAxis } from '@/lib/ai/prompt';
import { PROMPT_AXES } from '@/lib/ai/prompt';

/**
 * Le rapport IA, des deux côtés : ce qui a été conseillé, et ce que le lecteur en a fait.
 *
 * Deux enregistrements plutôt qu'un, parce qu'ils ne naissent ni au même moment ni du même
 * côté. L'empreinte est écrite par le serveur au moment de la génération ; le retour arrive
 * du navigateur, plus tard, et peut ne jamais arriver. Les fusionner obligerait à garder une
 * ligne ouverte en attente d'un clic qui ne viendra pas dans neuf cas sur dix.
 *
 * Ce que le corpus ne porte pas, et ne portera pas :
 *
 * - **La prose du rapport.** Ce sont des sorties de modèle : elles ne se comparent pas d'un
 *   rapport à l'autre, elles gonflent une clé qu'on ne peut pas nettoyer, et elles peuvent
 *   contenir n'importe quoi que le modèle a recopié des données — dont des noms de tiers,
 *   que le §5c des CGU interdit. Les axes couverts disent tout ce qu'un modèle peut
 *   apprendre : *sur quoi* on a parlé, pas *comment*.
 * - **Le moindre champ libre.** Un « dites-nous pourquoi » ouvre dans un corpus en écriture
 *   seule un canal de données personnelles qu'aucun plafond de longueur ne referme.
 *
 * `renderId` joint les deux à l'exposition et aux verdicts : c'est la seule clé du corpus.
 */

/** Le verdict du lecteur. Deux valeurs, pas une échelle : une note à cinq crans n'est pas lisible. */
export const REPORT_VERDICTS = ['useful', 'useless'] as const;
export type ReportVerdict = (typeof REPORT_VERDICTS)[number];

/**
 * L'empreinte du conseil, écrite au moment où le rapport part.
 *
 * Sans elle, un « inutile » ne se rattache à rien : on saurait qu'un lecteur a rejeté un
 * rapport sans savoir ce que ce rapport disait, ni avec quel modèle il avait été produit.
 * C'est de la capture — donc ça ne se repousse pas.
 */
export interface AdviceRecord {
  v: 3;
  kind: 'advice';
  at: string;
  /** SHA-256 salé, ou `null` pour une génération non authentifiée. Jamais l'e-mail. */
  by: string | null;
  renderId: string;
  encounterId: number;
  difficulty: number;
  specId: number;
  /** Version du prompt : deux rapports produits par deux consignes ne se comparent pas. */
  promptVersion: number;
  provider: string;
  /** Le modèle demandé, `null` quand le fournisseur choisit le sien. */
  model: string | null;
  /** Les axes réellement couverts, jamais le texte. */
  axes: PromptAxis[];
}

/** Ce que le navigateur envoie. Il ne choisit ni qui il est, ni quand. */
export interface ReportFeedbackSubmission {
  renderId: string;
  verdict: ReportVerdict;
  /**
   * Les axes que le lecteur a trouvés sans valeur.
   *
   * Le même vocabulaire que l'empreinte, pour que la confrontation soit possible : un axe
   * cité ici et absent de `axes` là-bas, c'est un lecteur qui reproche au rapport ce qu'il
   * n'a jamais dit — et c'est une information sur l'attente, pas une erreur de saisie.
   *
   * Autorisé sur un verdict `useful` : « utile, mais les talents n'ont rien apporté » est un
   * jugement fréquent et plus précis que les deux autres.
   */
  uselessAxes: PromptAxis[];
  /** Redondants avec l'empreinte, gardés au cas où celle-ci n'aurait pas pu être écrite. */
  encounterId: number;
  difficulty: number;
  specId: number;
}

export interface ReportFeedbackRecord extends ReportFeedbackSubmission {
  v: 3;
  kind: 'feedback';
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

/** Même plafond que le reste du corpus : un UUID de rendu fait 36 caractères. */
const MAX_FIELD_LENGTH = 64;

function str(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_FIELD_LENGTH;
}

/** Axes : bornés en nombre, sans doublon, tous connus. */
function axes(v: unknown): v is PromptAxis[] {
  if (!Array.isArray(v) || v.length > PROMPT_AXES.length) return false;
  if (new Set(v).size !== v.length) return false;
  return v.every((a) => (PROMPT_AXES as readonly unknown[]).includes(a));
}

/**
 * Valide un corps entrant champ par champ, ou rend `null`.
 *
 * Rien n'est recopié sans vérification, et les champs que le serveur possède — `v`, `kind`,
 * `at`, `by` — ne sont jamais repris de l'entrée.
 */
export function parseReportFeedback(input: unknown): ReportFeedbackSubmission | null {
  if (!isRecord(input)) return null;

  const { renderId, verdict, uselessAxes, encounterId, difficulty, specId } = input;

  // Un retour sans rendu ne se joint ni à l'empreinte ni à l'exposition : refusé.
  if (!str(renderId)) return null;
  if (!str(verdict) || !(REPORT_VERDICTS as readonly string[]).includes(verdict)) return null;
  if (!axes(uselessAxes)) return null;
  if (!num(encounterId) || !num(difficulty) || !num(specId)) return null;

  return {
    renderId,
    verdict: verdict as ReportVerdict,
    uselessAxes: [...uselessAxes],
    encounterId,
    difficulty,
    specId,
  };
}

/** `2026-08-07T09:14:22.000Z` → `labels:report:2026-08`. Une liste par mois, comme le reste. */
export function reportMonthKey(iso: string): string {
  return `labels:report:${iso.slice(0, 7)}`;
}
