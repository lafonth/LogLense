import type { StoredCharacter } from '@/types';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { redisGet } from '@/lib/redis';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email && !session?.user?.name) {
    return NextResponse.json({ favourites: [], recents: [] });
  }

  const userId = session.user.email ?? session.user.name ?? '';
  const [favRaw, recRaw] = await Promise.all([
    redisGet(`user:${userId}:favourites`),
    redisGet(`user:${userId}:recents`),
  ]);

  const favourites: StoredCharacter[] = favRaw ? (JSON.parse(favRaw) as StoredCharacter[]) : [];
  const recents: StoredCharacter[] = recRaw ? (JSON.parse(recRaw) as StoredCharacter[]) : [];

  return NextResponse.json({ favourites, recents });
}
