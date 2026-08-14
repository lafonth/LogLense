import type { NextRequest } from 'next/server';
import type { RaidRanking } from '@/lib/wcl/raid-ranking';
import { NextResponse } from 'next/server';
import { guardWclSpend, RAID_RANKING_UNITS } from '@/lib/api/wcl-guard';
import { recordIntraRaid } from '@/lib/labels/record-intra-raid';
import { getWCLToken } from '@/lib/wcl/auth';
import { fetchRaidRanking } from '@/lib/wcl/raid-ranking';

export const runtime = 'nodejs';

/**
 * Le classement d'un combat d'un rapport : `GET /api/raid/<code>?fight=<id>`.
 *
 * Une requête WCL, aucune résolution de référence, aucun appel par joueur — c'est ce qui
 * rend l'écran de tri gratuit à ouvrir. L'analyse complète reste sur `/api/report/analyze`,
 * pour le seul joueur qu'on ouvre.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!code || !/^[a-z0-9]{16}$/i.test(code)) {
    return NextResponse.json({ error: 'Invalid report code' }, { status: 400 });
  }

  const fightID = Number(req.nextUrl.searchParams.get('fight'));
  if (!Number.isInteger(fightID) || fightID <= 0) {
    return NextResponse.json({ error: 'Invalid fight id' }, { status: 400 });
  }

  const refusal = await guardWclSpend('raid', RAID_RANKING_UNITS);
  if (refusal) return refusal;

  const token = await getWCLToken(process.env.WCL_CLIENT_ID!, process.env.WCL_CLIENT_SECRET!);

  let ranking: RaidRanking | null;
  try {
    ranking = await fetchRaidRanking(token, code, fightID);
  } catch {
    return NextResponse.json({ error: 'Warcraft Logs request failed' }, { status: 502 });
  }
  if (!ranking) {
    return NextResponse.json({ error: 'Fight not found in this report' }, { status: 404 });
  }

  // La capture précède la réponse : une promesse laissée en `void` meurt avec la fonction
  // serverless. Le calcul se repousse, la donnée non capturée est perdue.
  await recordIntraRaid(ranking).catch(() => {});

  return NextResponse.json(ranking);
}
