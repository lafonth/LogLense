import { redisAppend, redisLlen } from '@/lib/redis';

/**
 * Ce qu'une clé mensuelle du corpus a le droit d'accumuler.
 *
 * Les flux d'étiquettes — huit aujourd'hui, trois quand ce plafond a été posé — sont tous
 * append-only et sans expiration : rien, dans le code, ne les raccourcit jamais. C'est
 * voulu — un corpus est l'actif du produit, et le purger par
 * TTL reviendrait à jeter la seule chose qui ne se reconstitue pas. Mais « sans purge » et
 * « sans borne » ne sont pas la même propriété : une exposition anonyme ne consomme aucun
 * quota, donc rien ne limitait la croissance d'une clé, et une instance Redis pleine perd
 * les écritures suivantes de *tous* les flux, y compris les verdicts humains, qui sont les
 * plus chers à obtenir.
 *
 * Le plafond est par clé, donc par mois : dépasser ferme le mois en cours, pas le corpus.
 * Cinquante mille enregistrements d'environ un kilo-octet tiennent dans l'instance avec de
 * la marge, et représentent un volume mensuel qu'aucun trafic légitime actuel n'approche.
 */
export const CORPUS_MONTH_CAP = 50_000;

/**
 * Le plafond propre au vivier, distinct de celui des étiquettes.
 *
 * Une analyse écrit une ligne par candidat vérifié, soit une douzaine, là où les autres flux
 * en écrivent une poignée : au plafond commun, une soirée de vivier fermerait le mois pour
 * les verdicts humains, qui sont les plus chers à obtenir. Trois fois le plafond commun
 * laisse une dizaine de milliers d'analyses par mois — largement au-dessus du trafic — tout
 * en gardant la clé bornée, ce qui est la seule chose que le plafond doit garantir.
 *
 * Les lignes de vivier sont aussi plus courtes : pointeurs et scalaires, sans stats ni
 * rotation. Le volume octet reste du même ordre que celui d'une clé d'étiquettes pleine.
 */
export const POOL_MONTH_CAP = 150_000;

/**
 * Le plafond propre à la demande Warcraft Logs.
 *
 * C'est le flux le plus fréquent du corpus : il écrit une ligne par requête qui dépense chez
 * WCL, y compris les lectures de métadonnées à une unité, là où les autres flux n'écrivent
 * qu'au bout d'une analyse. Ce sont en contrepartie les lignes les plus courtes — sept
 * scalaires, ni stats ni rotation ni pointeurs de combat.
 *
 * Au plafond commun, la demande fermerait le mois avant les verdicts humains, qui restent les
 * plus chers à obtenir. Et un mois de demande tronqué ne perd pas n'importe quelle part de sa
 * distribution : il perd la fin, donc les comptes qui demandent le plus — précisément ceux sur
 * lesquels ce flux existe pour renseigner.
 */
export const DEMAND_MONTH_CAP = 150_000;

export type CorpusWrite = 'written' | 'full' | 'failed';

/**
 * Ajoute au corpus, sauf si le mois est plein.
 *
 * `LLEN` puis `RPUSH` n'est pas atomique : deux écritures concurrentes peuvent franchir le
 * plafond ensemble. C'est accepté — le plafond protège d'une croissance non bornée, pas
 * d'un dépassement de quelques unités, et le rendre atomique demanderait un script Lua que
 * l'API REST d'Upstash ne justifie pas ici.
 *
 * **Un `RPUSH` en panne ne jette pas, il se dit.** L'appelant n'a rien à réessayer — la
 * capture est perdue quoi qu'il fasse — mais il a le droit de savoir qu'elle l'est : les
 * routes d'étiquettes répondent 503 plutôt que d'annoncer un verdict qui n'est pas entré.
 * Rendre `'written'` serait le seul mensonge que cette couche puisse faire.
 */
export async function appendToCorpus(key: string, value: string): Promise<CorpusWrite> {
  if (!(await hasCorpusRoom(key))) return 'full';

  try {
    await redisAppend(key, value);
  } catch {
    return 'failed';
  }
  return 'written';
}

/**
 * Reste-t-il de la place sous le plafond ?
 *
 * Séparé pour l'écriture par lot : une analyse consigne jusqu'à une dizaine d'expositions
 * d'affilée, et un `LLEN` par exposition doublerait le nombre d'allers-retours pour
 * mesurer dix fois la même chose. Le lot peut donc dépasser le plafond de sa propre
 * taille — une dizaine d'enregistrements sur cinquante mille.
 *
 * **Un `LLEN` en panne refuse.** Ce plafond n'existe que pour borner la croissance d'une clé
 * que rien ne purge : laisser passer ce qu'on n'a pas su compter, c'est retirer la borne
 * exactement quand elle sert — une instance pleine perd ensuite les écritures de *tous* les
 * flux, y compris les verdicts humains, les plus chers à obtenir. Une capture manquée se
 * rattrape à la requête suivante ; un corpus saturé, non.
 *
 * `cap` est explicite parce que tous les flux ne partagent pas le même plafond : voir
 * `POOL_MONTH_CAP`.
 */
export async function hasCorpusRoom(key: string, cap: number = CORPUS_MONTH_CAP): Promise<boolean> {
  try {
    return (await redisLlen(key)) < cap;
  } catch {
    return false;
  }
}
