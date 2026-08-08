/**
 * Primitives de validation pour les corps de requête.
 *
 * `req.json()` rend `any`, et une assertion `as` sur ce `any` ne vérifie rien : elle
 * déclare une forme au compilateur et laisse passer tout le reste à l'exécution. Ce qui
 * traverse ensuite n'est pas anodin — un corps d'analyse déclenche une cinquantaine de
 * requêtes chez WCL sous la clé du produit, un favori est écrit dans Redis sans relecture.
 *
 * `src/lib/labels/schema.ts` a les siennes, volontairement séparées : son plafond de
 * longueur est celui d'un corpus permanent qu'on ne peut pas nettoyer, pas celui d'une
 * requête. Les deux évolueront pour des raisons différentes.
 */

/** Plafond de longueur des chaînes venues du client. Aucun champ légitime n'en approche. */
export const MAX_INPUT_LENGTH = 128;

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Nombre fini : `NaN` et les infinis viennent de JSON mal formé ou d'un client hostile. */
export function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Chaîne non vide et bornée. */
export function isStr(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_INPUT_LENGTH;
}

/** Appartenance à une liste close, en gardant le type littéral. */
export function isOneOf<T extends string | number>(v: unknown, allowed: readonly T[]): v is T {
  return (allowed as readonly unknown[]).includes(v);
}

/**
 * Lit le corps JSON sans jeter.
 *
 * Un corps absent, tronqué ou non-JSON fait jeter `req.json()`, et l'exception non
 * rattrapée sort en 500 : le serveur s'accuserait d'une faute du client.
 */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
