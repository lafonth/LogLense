import type { NextRequest } from 'next/server';
import type { StoredCharacter } from '@/types';
import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import { isRecord, isStr, readJson } from '@/lib/api/parse';
import { authOptions } from '@/lib/auth';
import { redisGet, redisSet } from '@/lib/redis';

export const runtime = 'nodejs';

/**
 * Combien de personnages un compte peut épingler.
 *
 * La clé est écrite sans relecture et sans expiration : sans plafond, une session valide
 * peut y pousser autant d'entrées qu'elle veut, et c'est la seule limite qui existe.
 * Personne ne joue cinquante personnages de front.
 */
const MAX_FAVOURITES = 50;

function charKey(c: StoredCharacter) {
  return `${c.name.toLowerCase()}-${c.realmSlug.toLowerCase()}-${c.region.toLowerCase()}`;
}

/**
 * Valide le personnage entrant, ou rend `null`.
 *
 * Le corps arrive du navigateur et repart tel quel dans Redis, puis dans le rendu : un
 * champ manquant faisait jeter `charKey` en 500, et un champ de taille arbitraire
 * gonflait une clé qu'aucun code ne raccourcit.
 */
function parseStoredCharacter(input: unknown): StoredCharacter | null {
  if (!isRecord(input)) return null;

  const { name, realmName, realmSlug, region, class: klass } = input;

  if (!isStr(name) || !isStr(realmName) || !isStr(realmSlug)) return null;
  if (!isStr(region) || !isStr(klass)) return null;

  return { name, realmName, realmSlug, region, class: klass };
}

/**
 * Relit la liste stockée sans jeter.
 *
 * Ce qui a été écrit par une version antérieure du code n'a pas forcément la forme
 * d'aujourd'hui, et une clé illisible ne doit pas empêcher d'en épingler un de plus :
 * on repart d'une liste vide plutôt que de rendre un 500 dont l'appelant ne peut rien.
 */
function readFavourites(raw: string | null): StoredCharacter[] {
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseStoredCharacter).filter((c): c is StoredCharacter => c !== null);
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email && !session?.user?.name) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.email ?? session.user.name ?? '';
  const char = parseStoredCharacter(await readJson(req));

  if (!char) {
    return NextResponse.json({ error: 'Invalid character' }, { status: 400 });
  }

  const key = `user:${userId}:favourites`;

  const raw = await redisGet(key);
  const current = readFavourites(raw);

  const idx = current.findIndex((c) => charKey(c) === charKey(char));

  // Le plafond ne s'applique qu'à l'ajout : retirer doit rester possible même au-delà,
  // sans quoi une liste devenue trop longue ne se réduirait plus.
  if (idx === -1 && current.length >= MAX_FAVOURITES) {
    return NextResponse.json({ error: 'Too many favourites' }, { status: 409 });
  }

  const updated = idx === -1 ? [...current, char] : current.filter((_, i) => i !== idx);

  await redisSet(key, JSON.stringify(updated));
  return NextResponse.json({ favourites: updated });
}
