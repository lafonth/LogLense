import type { StrictVerdict } from './rate-limit';
import { redisAppend } from '@/lib/redis';
import { DEMAND_MONTH_CAP, hasCorpusRoom } from './corpus';
import { hashUserId } from './identity';
import { WCL_UNIT_LIMIT } from './rate-limit';

/**
 * Les routes qui dépensent le budget Warcraft Logs.
 *
 * Union fermée, et pas une `string` libre, pour deux raisons. Ces valeurs deviennent des
 * étiquettes de corpus : une faute de frappe y créerait un seau fantôme qu'aucune relecture ne
 * rattraperait, puisque rien n'est jamais purgé. Et brancher une nouvelle route sur le budget
 * WCL doit forcer une décision d'étiquetage plutôt que de la laisser se prendre toute seule.
 */
export type WclRoute =
  | 'analyze'
  | 'report-analyze'
  | 'raid'
  | 'report'
  | 'zones'
  | 'realm-search'
  | 'pull-comparison';

export type DemandOutcome = 'allowed' | 'denied' | 'unavailable';

export interface DemandRecord {
  route: WclRoute;
  /** Ce que la requête a demandé au budget. */
  units: number;
  /** Ce que le compteur totalise après elle, `null` s'il n'a pas répondu. */
  consumed: number | null;
  /** Le plafond en vigueur au moment de la mesure — il changera, les lignes passées non. */
  limit: number;
  outcome: DemandOutcome;
  by: string;
  at: string;
}

export function demandMonthKey(iso: string): string {
  return `labels:demand:${iso.slice(0, 7)}`;
}

function outcomeOf(verdict: StrictVerdict): DemandOutcome {
  if (verdict.unavailable) return 'unavailable';
  return verdict.allowed ? 'allowed' : 'denied';
}

/**
 * Écrit au corpus ce qu'une requête a demandé au budget Warcraft Logs, et ce qu'elle a obtenu.
 *
 * Mêmes règles que les sept autres écritures de corpus, pour les mêmes raisons : appelée côté
 * serveur et **attendue** avant la réponse — sur un runtime serverless une promesse non
 * attendue part avec la fonction, et c'est vrai du chemin 429 comme du chemin 200 — elle **ne
 * jette jamais**, et elle **échoue fermé sur l'identité** : `hashUserId` jette sans
 * `LABEL_SALT`, l'exception remonte au `catch`, et rien n'entre au corpus plutôt qu'un `by`
 * menteur.
 *
 * Deux écarts assumés avec `recordPool`, tous deux dictés par l'appelant :
 *
 * - **pas de `getServerSession` ici.** `guardWclSpend` a déjà résolu la session pour décider
 *   du 401 ; la redemander décoderait le même JWT une seconde fois à chaque requête. Le
 *   `userId` arrive donc en argument, et il est non vide par construction — passé le 401, un
 *   appelant anonyme n'atteint plus ce code, d'où un `by` qui n'est jamais `null`.
 * - **aucun quota d'exposition consommé.** La requête est déjà bornée par le quota WCL
 *   lui-même ; un second plafond rationnerait la mesure, et il la couperait exactement là où
 *   elle est intéressante — sur les comptes qui demandent le plus.
 */
export async function recordDemand(
  route: WclRoute,
  units: number,
  verdict: StrictVerdict,
  userId: string
): Promise<void> {
  try {
    const by = hashUserId(userId);
    const at = new Date().toISOString();
    const key = demandMonthKey(at);

    if (!(await hasCorpusRoom(key, DEMAND_MONTH_CAP))) return;

    const record: DemandRecord = {
      route,
      units,
      consumed: verdict.consumed,
      limit: WCL_UNIT_LIMIT,
      outcome: outcomeOf(verdict),
      by,
      at,
    };

    await redisAppend(key, JSON.stringify(record));
  } catch {
    // Avalé volontairement : voir l'en-tête.
  }
}
