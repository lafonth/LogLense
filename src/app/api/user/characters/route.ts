import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const runtime = 'nodejs';

const REGION_HOSTS: Record<string, string> = {
  US: 'us.api.blizzard.com',
  EU: 'eu.api.blizzard.com',
  KR: 'kr.api.blizzard.com',
  TW: 'tw.api.blizzard.com',
};

interface WowAccount {
  characters: Array<{
    id: number;
    name: string;
    level: number;
    realm: { name: string; slug: string };
    playable_class: { name: string; id: number };
    faction: { type: string };
  }>;
}

interface WowProfileResponse {
  wow_accounts: WowAccount[];
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const region = (new URL(req.url).searchParams.get('region') ?? 'EU').toUpperCase();
  const host = REGION_HOSTS[region] ?? REGION_HOSTS.EU;
  const namespace = `profile-${region.toLowerCase()}`;

  const res = await fetch(
    `https://${host}/profile/user/wow?namespace=${namespace}&locale=en_US`,
    { headers: { Authorization: `Bearer ${session.accessToken}` } }
  );

  if (!res.ok) return NextResponse.json([]);

  const data = (await res.json()) as WowProfileResponse;
  const characters = (data.wow_accounts ?? [])
    .flatMap((a) => a.characters)
    .filter((c) => c.level >= 10)
    .map((c) => ({
      id: c.id,
      name: c.name,
      realmName: c.realm.name,
      realmSlug: c.realm.slug,
      class: c.playable_class.name,
      classId: c.playable_class.id,
      level: c.level,
      faction: c.faction.type,
    }))
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));

  return NextResponse.json(characters);
}
