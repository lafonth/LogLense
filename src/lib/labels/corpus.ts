import { redisAppend, redisLlen } from '@/lib/redis';

/**
 * Ce qu'une clé mensuelle du corpus a le droit d'accumuler.
 *
 * Les trois flux d'étiquettes sont append-only et sans expiration : rien, dans le code, ne
 * les raccourcit jamais. C'est voulu — un corpus est l'actif du produit, et le purger par
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

export type CorpusWrite = 'written' | 'full';

/**
 * Ajoute au corpus, sauf si le mois est plein.
 *
 * `LLEN` puis `RPUSH` n'est pas atomique : deux écritures concurrentes peuvent franchir le
 * plafond ensemble. C'est accepté — le plafond protège d'une croissance non bornée, pas
 * d'un dépassement de quelques unités, et le rendre atomique demanderait un script Lua que
 * l'API REST d'Upstash ne justifie pas ici.
 *
 * **Un `LLEN` en panne laisse passer l'écriture.** Refuser reviendrait à perdre une capture
 * pour n'avoir pas su la compter, alors que le calcul se rattrape et la donnée non capturée
 * jamais. L'échec de `RPUSH`, lui, remonte : l'appelant sait déjà quoi en faire.
 */
export async function appendToCorpus(key: string, value: string): Promise<CorpusWrite> {
  if (!(await hasCorpusRoom(key))) return 'full';

  await redisAppend(key, value);
  return 'written';
}

/**
 * Reste-t-il de la place sous le plafond ?
 *
 * Séparé pour l'écriture par lot : une analyse consigne jusqu'à une dizaine d'expositions
 * d'affilée, et un `LLEN` par exposition doublerait le nombre d'allers-retours pour
 * mesurer dix fois la même chose. Le lot peut donc dépasser le plafond de sa propre
 * taille — une dizaine d'enregistrements sur cinquante mille.
 */
export async function hasCorpusRoom(key: string): Promise<boolean> {
  try {
    return (await redisLlen(key)) < CORPUS_MONTH_CAP;
  } catch {
    return true;
  }
}
