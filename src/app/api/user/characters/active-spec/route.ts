import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { DEV_STUB_ACCESS_TOKEN } from '@/lib/dev-session';
import { getSpecInfo } from '@/lib/specs';

export const runtime = 'nodejs';

const REGION_HOSTS: Record<string, string> = {
  US: 'us.api.blizzard.com',
  EU: 'eu.api.blizzard.com',
  KR: 'kr.api.blizzard.com',
  TW: 'tw.api.blizzard.com',
};

interface BlizzardCharacterSummary {
  active_spec?: { id: number; name: string };
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Dev-only session stub has no real Blizzard access token — skip the real
  // lookup and let the client fall back to a default DPS spec for the class.
  if (session.accessToken === DEV_STUB_ACCESS_TOKEN) {
    return NextResponse.json({ specId: null });
  }

  const url = new URL(req.url);
  const name = url.searchParams.get('name');
  const realm = url.searchParams.get('realm');
  const region = (url.searchParams.get('region') ?? 'EU').toUpperCase();

  if (!name || !realm) {
    return NextResponse.json({ error: 'name and realm are required' }, { status: 400 });
  }

  const host = REGION_HOSTS[region] ?? REGION_HOSTS.EU;
  const namespace = `profile-${region.toLowerCase()}`;
  const charPath = `${realm.toLowerCase()}/${name.toLowerCase()}`;

  try {
    const res = await fetch(
      `https://${host}/profile/wow/character/${charPath}?namespace=${namespace}&locale=en_US`,
      { headers: { Authorization: `Bearer ${session.accessToken}` } }
    );

    if (!res.ok) {
      return NextResponse.json({ specId: null });
    }

    const data = (await res.json()) as BlizzardCharacterSummary;
    const blizzardSpecId = data.active_spec?.id ?? null;

    if (!blizzardSpecId) return NextResponse.json({ specId: null });

    const specInfo = getSpecInfo(blizzardSpecId);
    return NextResponse.json({ specId: specInfo ? blizzardSpecId : null });
  } catch {
    return NextResponse.json({ specId: null });
  }
}
