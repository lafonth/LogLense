import type { StrictVerdict } from './rate-limit';
import { redisAppend } from '@/lib/redis';
import { DEMAND_MONTH_CAP, hasCorpusRoom } from './corpus';
import { hashUserId } from './identity';
import { WCL_GLOBAL_UNIT_LIMIT, WCL_UNIT_LIMIT } from './rate-limit';

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
  | 'pull-comparison'
  | 'promote-reference';

export type DemandOutcome = 'allowed' | 'denied' | 'unavailable';

export interface DemandRecord {
  /**
   * Les deux discriminants que les sept autres flux portent depuis leur première ligne, et que
   * celui-ci a été écrit sans.
   *
   * Ils ne servent à rien tant qu'une clé ne contient qu'une forme — et c'est exactement pour
   * ça qu'ils s'oublient. Ils servent le jour où la forme change : sans `v`, un lecteur ne peut
   * pas distinguer un champ absent d'un champ pas encore introduit, et sans `kind` il ne peut
   * pas trier une clé qui en mêlerait deux, comme `labels:report` mêle déjà `advice` et
   * `feedback`. C'est la classe d'erreur du corpus : append-only, jamais purgé, donc une ligne
   * écrite sans discriminant n'en gagnera jamais un rétroactivement.
   *
   * **Les lignes antérieures à ce commit n'ont ni l'un ni l'autre.** Un lecteur de
   * `labels:demand:*` doit lire leur absence comme `v: 0, kind: 'demand'` : la clé ne portait
   * alors que cette forme, ce qui rend l'inférence sûre ici et le resterait mal ailleurs.
   */
  v: 2;
  kind: 'demand';
  route: WclRoute;
  /** Ce que la requête a demandé au budget. */
  units: number;
  /** Ce que le compteur du compte totalise après elle, `null` s'il n'a pas répondu. */
  consumed: number | null;
  /** Le plafond en vigueur au moment de la mesure — il changera, les lignes passées non. */
  limit: number;
  /**
   * Le compteur partagé par tous les comptes, `null` quand le quota du compte a refusé avant
   * qu'on l'atteigne.
   *
   * Ce `null` n'est pas une absence de mesure : il dit que le compteur commun n'a pas été
   * consulté, ce qui est précisément l'ordre voulu. Il rend aussi lisible **lequel des deux
   * plafonds a décidé** sans champ supplémentaire — un `outcome` non `allowed` avec un `global`
   * renseigné ne peut venir que du plafond commun, puisque celui du compte l'avait laissé
   * passer.
   *
   * **Les lignes en `v: 1` n'ont pas ce champ**, et il ne faut pas lire leur absence comme un
   * compteur commun qui n'aurait rien vu : il n'existait pas.
   */
  global: { consumed: number | null; limit: number } | null;
  /** L'issue rendue à l'appelant : celle du compteur qui a décidé. */
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
  userId: string,
  globalVerdict: StrictVerdict | null = null
): Promise<void> {
  try {
    const by = hashUserId(userId);
    const at = new Date().toISOString();
    const key = demandMonthKey(at);

    if (!(await hasCorpusRoom(key, DEMAND_MONTH_CAP))) return;

    const record: DemandRecord = {
      v: 2,
      kind: 'demand',
      route,
      units,
      consumed: verdict.consumed,
      limit: WCL_UNIT_LIMIT,
      global: globalVerdict
        ? { consumed: globalVerdict.consumed, limit: WCL_GLOBAL_UNIT_LIMIT }
        : null,
      // Le compteur commun ne parle que quand celui du compte a laissé passer : c'est donc lui
      // qui porte l'issue dès qu'il a été consulté.
      outcome: outcomeOf(globalVerdict ?? verdict),
      by,
      at,
    };

    await redisAppend(key, JSON.stringify(record));
  } catch {
    // Avalé volontairement : voir l'en-tête.
  }
}
