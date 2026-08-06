import { createHash } from 'node:crypto';

/**
 * L'identifiant stable et anonyme d'un utilisateur dans le corpus.
 *
 * Suffit à dédupliquer et à repérer un abus, sans mettre d'adresse e-mail dans un jeu de
 * données destiné à durer. Sans sel, on refuse d'écrire : mélanger des identifiants salés
 * et non salés rendrait le corpus impossible à certifier, et c'est irréversible.
 */
export function hashUserId(userId: string): string {
  const salt = process.env.LABEL_SALT;
  if (!salt) {
    throw new Error('LABEL_SALT is not set; refusing to write an unsalted identifier');
  }
  return createHash('sha256').update(`${salt}:${userId}`).digest('hex').slice(0, 32);
}
