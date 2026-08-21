import type { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import { readJson } from '@/lib/api/parse';
import { charKey, parseStoredCharacter, readStoredCharacters } from '@/lib/api/stored-character';
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
  const current = readStoredCharacters(raw);

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
