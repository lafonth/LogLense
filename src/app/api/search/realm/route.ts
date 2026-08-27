import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { logRouteError } from '@/lib/api/log-error';
import { guardWclSpend, METADATA_UNITS } from '@/lib/api/wcl-guard';
import { blizzardCredentials } from '@/lib/blizzard-credentials';

export const runtime = 'nodejs';

const BNET_TOKEN_URL = 'https://oauth.battle.net/token';

let cachedToken: string | null = null;
let cacheExpiresAt = 0;

async function getBnetToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < cacheExpiresAt) return cachedToken;

  const { clientId, clientSecret } = blizzardCredentials();
  if (!clientId || !clientSecret) throw new Error('Blizzard credentials not configured');
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
};

interface BnetRealmIndex {
  realms: Array<{ id: number; name: string; slug: string }>;
}

// Cache realm lists per region — they rarely change
const realmCache: Record<
  string,
  { items: { id: number; name: string; slug: string }[]; at: number }
> = {};
const REALM_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

export async function GET(req: NextRequest) {
  // Cette route interroge Blizzard, pas Warcraft Logs, mais elle le fait avec une clé du
  // produit et son abus se sanctionne pareil. Elle partage donc le compteur plutôt que d'en
  // ouvrir un cinquième : c'est un budget d'appels tiers, pas un budget par fournisseur.
  // La garde passe avant le cache mémoire — une unité sur deux mille ne vaut pas une
  // exception qui laisserait la route ouverte aux anonymes dès qu'elle est chaude.
  const refusal = await guardWclSpend('realm-search', METADATA_UNITS);
  if (refusal) return refusal;

  const region = (new URL(req.url).searchParams.get('region') ?? 'EU').toUpperCase();
  const host = REGION_HOSTS[region] ?? REGION_HOSTS.EU;
  const namespace = `dynamic-${region.toLowerCase()}`;

  const cached = realmCache[region];
  if (cached && Date.now() - cached.at < REALM_CACHE_TTL) {
    return NextResponse.json(cached.items);
  }

  try {
    const token = await getBnetToken();
    const url = `https://${host}/data/wow/realm/index?namespace=${namespace}&locale=en_US`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    if (!res.ok) return NextResponse.json([]);

    const data = (await res.json()) as BnetRealmIndex;
    const items = (data.realms ?? [])
      .map((r) => ({ id: r.id, name: r.name, slug: r.slug }))
      .sort((a, b) => a.name.localeCompare(b.name));

    realmCache[region] = { items, at: Date.now() };
    return NextResponse.json(items);
  } catch (error) {
    // Un repli qui répond 200 sur une liste vide : à l'écran, un royaume qui « n'existe pas ».
    // C'est le pire des échecs muets — le joueur le lit comme sa propre faute de frappe.
    logRouteError('realm-search', error);
    return NextResponse.json([]);
  }
}
