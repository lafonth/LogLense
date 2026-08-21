import type { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import { readJson } from '@/lib/api/parse';
import { charKey, parseStoredCharacter, readStoredCharacters } from '@/lib/api/stored-character';
import { authOptions } from '@/lib/auth';
import { redisGet, redisSet } from '@/lib/redis';

export const runtime = 'nodejs';

const MAX_RECENTS = 5;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email && !session?.user?.name) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.email ?? session.user.name ?? '';

  // Mêmes règles que les favoris, et pour la même raison : ce corps est écrit dans Redis
  // puis rendu tel quel. L'`as StoredCharacter` d'avant ne vérifiait rien — un corps sans
  // `realmSlug` faisait jeter `charKey`, donc un 500 pour une faute du client.
  const char = parseStoredCharacter(await readJson(req));

  if (!char) {
    return NextResponse.json({ error: 'Invalid character' }, { status: 400 });
  }

  const key = `user:${userId}:recents`;

  const raw = await redisGet(key);
  const current = readStoredCharacters(raw);

  const deduped = current.filter((c) => charKey(c) !== charKey(char));
  const updated = [char, ...deduped].slice(0, MAX_RECENTS);

  await redisSet(key, JSON.stringify(updated));
  return NextResponse.json({ recents: updated });
}
