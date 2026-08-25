import type { ChatToolName, CohortAxis, OutOfScopeTopic } from '@/lib/ai/chat-tools';

/**
 * Ce que le corpus retient d'un tour de chat : ce qui a été demandé aux données, jamais ce
 * qui a été dit.
 *
 * Le chat est la surface la plus tentante du produit pour une transcription — c'est aussi la
 * seule où la question est écrite par un humain, en clair, sur un sujet qu'il n'a pas choisi
 * dans une liste. Les deux refus de `report.ts` s'y appliquent donc plus fort qu'ailleurs :
 * ni la prose du modèle, ni le moindre champ libre. Une question de joueur est un champ libre
 * qui s'ignore, et l'écrire ouvrirait dans un corpus sans purge un canal de données
 * personnelles qu'aucun plafond de longueur ne referme.
 *
 * Reste ce qui se compare d'un tour à l'autre, et qui suffit à répondre aux seules questions
 * qu'on se pose : quels outils ont servi, sur quels axes la cohorte a été rejouée, combien de
 * tours finissent en refus hors périmètre, et ce que le chat coûte réellement chez Warcraft
 * Logs. Tout est en vocabulaire fermé, donc dénombrable sans jamais être lu.
 *
 * `renderId` joint le tour à l'exposition, aux verdicts et au rapport : c'est la seule clé du
 * corpus, et elle vaut ici plus qu'ailleurs — elle dit à quelle analyse la conversation se
 * rapportait.
 */
export interface ChatTurnRecord {
  v: 1;
  kind: 'chat';
  at: string;
  /**
   * SHA-256 salé, jamais l'e-mail. Non nullable, contrairement à `AdviceRecord` : le chat
   * n'a pas de voie BYOK anonyme — il lit un instantané, et cette lecture exige une session.
   */
  by: string;
  renderId: string;
  encounterId: number;
  difficulty: number;
  specId: number;
  /** `CHAT_PROMPT_VERSION`, distincte de celle du rapport : les deux consignes évoluent seules. */
  promptVersion: number;
  provider: string;
  /** Le modèle demandé, `null` quand le fournisseur choisit le sien. */
  model: string | null;
  /** Rang du tour dans la conversation, à partir de 1. Sans lui, on ne sait pas si le chat
   * sert une question ou dix. */
  turn: number;
  /** Les outils appelés pendant ce tour, dans l'ordre. Vide quand le modèle a répondu seul. */
  tools: ChatToolName[];
  /** Les axes de resélection demandés, sans doublon. */
  axes: CohortAxis[];
  /** Le sujet refusé, ou `null`. */
  declined: OutOfScopeTopic | null;
  /**
   * Vrai dès qu'un outil a refusé, pour quelque raison que ce soit — hors périmètre, dépense
   * non accordée, instantané périmé. C'est la mesure de la position produit : un chat qui ne
   * refuse jamais ne tient pas son périmètre, et un chat qui refuse tout ne sert à rien.
   */
  refused: boolean;
  /** Requêtes Warcraft Logs réellement parties pendant ce tour. Zéro dans le cas courant. */
  wclCalls: number;
}

/** `2026-08-24T09:14:22.000Z` → `labels:chat:2026-08`. Une liste par mois, comme le reste.
 *
 * Clé propre, séparée de celle du rapport : les deux flux n'ont ni la même fréquence ni la
 * même forme, et un mois de chat n'a pas à fermer le mois des verdicts humains.
 */
export function chatMonthKey(iso: string): string {
  return `labels:chat:${iso.slice(0, 7)}`;
}
