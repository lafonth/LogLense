import type { StoredCharacter } from '@/types';
import { isRecord, isStr } from './parse';

/**
 * Ce qu'un personnage stocké doit être avant d'entrer dans Redis, et ce qu'il faut en
 * relire quand il en sort.
 *
 * Extrait de la route des favoris, où ces règles vivaient seules : `recents` écrivait la
 * même clé sur un `as StoredCharacter`, donc sans rien vérifier, et relisait la sienne par
 * un `JSON.parse` nu. Deux routes qui écrivent la même forme au même endroit ne peuvent pas
 * la valider différemment — sinon la plus laxiste décide de ce que l'autre relira.
 */

/** L'identité d'un personnage, insensible à la casse : Redis garde ce que le client a tapé. */
export function charKey(c: StoredCharacter) {
  return `${c.name.toLowerCase()}-${c.realmSlug.toLowerCase()}-${c.region.toLowerCase()}`;
}

/**
 * Valide le personnage entrant, ou rend `null`.
 *
 * Le corps arrive du navigateur et repart tel quel dans Redis, puis dans le rendu : un
 * champ manquant faisait jeter `charKey` en 500, et un champ de taille arbitraire
 * gonflait une clé qu'aucun code ne raccourcit.
 */
export function parseStoredCharacter(input: unknown): StoredCharacter | null {
  if (!isRecord(input)) return null;

  const { name, realmName, realmSlug, region, class: klass } = input;

  if (!isStr(name) || !isStr(realmName) || !isStr(realmSlug)) return null;
  if (!isStr(region) || !isStr(klass)) return null;

  return { name, realmName, realmSlug, region, class: klass };
}

/**
 * Relit une liste stockée sans jeter.
 *
 * Ce qui a été écrit par une version antérieure du code n'a pas forcément la forme
 * d'aujourd'hui, et une clé illisible ne doit pas empêcher d'en épingler un de plus :
 * on repart d'une liste vide plutôt que de rendre un 500 dont l'appelant ne peut rien.
 */
export function readStoredCharacters(raw: string | null): StoredCharacter[] {
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseStoredCharacter).filter((c): c is StoredCharacter => c !== null);
  } catch {
    return [];
  }
}
