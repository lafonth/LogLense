import type { NextRequest} from 'next/server';
import type { StoredCharacter } from '@/types';
import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { redisGet, redisSet } from '@/lib/redis';

export const runtime = 'nodejs';

function charKey(c: StoredCharacter) {
  return `${c.name.toLowerCase()}-${c.realmSlug.toLowerCase()}-${c.region.toLowerCase()}`;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email && !session?.user?.name) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.email ?? session.user.name ?? '';
  const char = (await req.json()) as StoredCharacter;
  const key = `user:${userId}:favourites`;

  const raw = await redisGet(key);
  const current: StoredCharacter[] = raw ? (JSON.parse(raw) as StoredCharacter[]) : [];

  const idx = current.findIndex((c) => charKey(c) === charKey(char));
  const updated = idx === -1 ? [...current, char] : current.filter((_, i) => i !== idx);

  await redisSet(key, JSON.stringify(updated));
  return NextResponse.json({ favourites: updated });
}
