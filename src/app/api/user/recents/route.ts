import type { StoredCharacter } from '@/types';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { redisGet, redisSet } from '@/lib/redis';

export const runtime = 'nodejs';

const MAX_RECENTS = 5;

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
  const key = `user:${userId}:recents`;

  const raw = await redisGet(key);
  const current: StoredCharacter[] = raw ? (JSON.parse(raw) as StoredCharacter[]) : [];

  const deduped = current.filter((c) => charKey(c) !== charKey(char));
  const updated = [char, ...deduped].slice(0, MAX_RECENTS);

  await redisSet(key, JSON.stringify(updated));
  return NextResponse.json({ recents: updated });
}
