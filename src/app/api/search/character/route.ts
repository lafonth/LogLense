import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const BNET_TOKEN_URL = 'https://oauth.battle.net/token';

let cachedToken: string | null = null;
let cacheExpiresAt = 0;

async function getBnetToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < cacheExpiresAt) return cachedToken;

  const clientId = process.env.BLIZZARD_CLIENT_ID!;
  const clientSecret = process.env.BLIZZARD_CLIENT_SECRET!;
  const credentials = btoa(`${clientId}:${clientSecret}`);

  const res = await fetch(BNET_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) throw new Error(`Battle.net auth failed: ${res.status}`);

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = data.access_token;
  const ttlMs = ((data.expires_in ?? 86400) - 60) * 1000;
  cacheExpiresAt = now + ttlMs;
  return cachedToken;
}

const REGION_HOSTS: Record<string, string> = {
  US: 'us.api.blizzard.com',
  EU: 'eu.api.blizzard.com',
  KR: 'kr.api.blizzard.com',
  TW: 'tw.api.blizzard.com',
  CN: 'gateway.battlenet.com.cn',
};

interface BnetSearchResult {
  results: Array<{
    data: {
      name: string;
      realm: { slug: string; name: { en_US: string } };
    };
  }>;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const region = (searchParams.get('region') ?? 'EU').toUpperCase();

  if (q.length < 2) return NextResponse.json([]);

  const host = REGION_HOSTS[region] ?? REGION_HOSTS.EU;
  const namespace = `profile-${region.toLowerCase()}`;

  try {
    const token = await getBnetToken();
    const url = `https://${host}/profile/wow/search/character?namespace=${namespace}&name.en_US=${encodeURIComponent(q)}&orderby=name&_page=1&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) return NextResponse.json([]);

    const data = (await res.json()) as BnetSearchResult;
    const suggestions = (data.results ?? []).slice(0, 10).map((r) => ({
      name: r.data.name,
      realmSlug: r.data.realm.slug,
      realmName: r.data.realm.name.en_US,
    }));

    return NextResponse.json(suggestions);
  } catch {
    return NextResponse.json([]);
  }
}
