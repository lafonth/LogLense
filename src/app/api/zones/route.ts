export const runtime = 'nodejs';

import type { Zone } from '@/types';
import { NextResponse } from 'next/server';
import { getWCLToken } from '@/lib/wcl/auth';
import { gql } from '@/lib/wcl/client';
import { Q_ZONES } from '@/lib/wcl/queries';

const RAID_DIFFICULTY_IDS = new Set([3, 4, 5]);

interface ZonesResponse {
  worldData: {
    zones: Array<{
      id: number;
      name: string;
      difficulties: Array<{ id: number }>;
      encounters: Array<{ id: number; name: string }>;
    }>;
  };
}

export async function GET() {
  const clientId = process.env.WCL_CLIENT_ID;
  const clientSecret = process.env.WCL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'WCL credentials not configured' }, { status: 500 });
  }

  try {
    const token = await getWCLToken(clientId, clientSecret);
    const data = await gql<ZonesResponse>(token, Q_ZONES);

    const zones: Zone[] = data.worldData.zones
      .filter(
        (z) => z.encounters.length > 0 && z.difficulties.some((d) => RAID_DIFFICULTY_IDS.has(d.id))
      )
      .sort((a, b) => b.id - a.id);

    return NextResponse.json(zones);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch zones';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
