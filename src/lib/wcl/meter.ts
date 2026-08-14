import { AsyncLocalStorage } from 'node:async_hooks';

interface CallCount {
  calls: number;
}

/**
 * Compteur d'appels Warcraft Logs, porté par le contexte asynchrone de la requête.
 *
 * En `AsyncLocalStorage` et pas en variable de module : les route handlers d'un même
 * processus se chevauchent, et un compteur global additionnerait les appels de tout le monde
 * — le règlement de quota rendrait alors à un utilisateur ce qu'un autre a dépensé.
 */
const meter = new AsyncLocalStorage<CallCount>();

/**
 * Compte une requête posée à Warcraft Logs.
 *
 * Sans mesure en cours, ne fait rien : les cinq routes qui n'ont pas de règlement — et les
 * tests — appellent `gql` hors de tout contexte, et cela doit rester sans effet.
 *
 * Comptée une fois par requête posée, pas une fois par tentative. C'est l'unité dans
 * laquelle `BOSS_ANALYSIS_UNITS` a été estimé ; mesurer les tentatives comparerait un
 * relevé à une réservation qui ne parle pas la même langue. Une requête réessayée après un
 * 429 n'a de toute façon rien coûté à son premier essai — WCL l'a refusée avant de
 * l'exécuter.
 */
export function countWclCall(): void {
  const count = meter.getStore();
  if (count) count.calls += 1;
}

/**
 * Exécute `run` en comptant les appels Warcraft Logs qu'il déclenche, puis règle.
 *
 * `settle` est appelé dans un `finally` : une analyse qui jette à mi-parcours a bel et bien
 * dépensé les appels déjà partis, et les laisser non réglés reviendrait à facturer le
 * forfait entier pour une requête qui a échoué tôt.
 *
 * `settle` ne doit jamais jeter — remplacer l'erreur de l'analyse par celle du règlement
 * ferait disparaître la seule des deux qui intéresse l'appelant.
 */
export async function meterWclCalls<T>(
  run: () => Promise<T>,
  settle: (calls: number) => Promise<void>
): Promise<T> {
  const count: CallCount = { calls: 0 };

  try {
    return await meter.run(count, run);
  } finally {
    await settle(count.calls);
  }
}
