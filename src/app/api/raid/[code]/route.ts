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

  // Les identifiants d'abord, le quota ensuite : une configuration absente ne doit rien
  // prélever. C'est la forme de `zones/route.ts`, et la leçon de C2.
  const clientId = process.env.WCL_CLIENT_ID;
  const clientSecret = process.env.WCL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'WCL credentials not configured' }, { status: 500 });
  }

  const refusal = await guardWclSpend('raid', RAID_RANKING_UNITS);
  if (refusal) return refusal;

  // L'obtention du jeton est dans le `try` : c'est un appel réseau comme le suivant, et
  // il échoue pour les mêmes raisons. Le 502 dit ici « l'amont a échoué », plus précis
  // que le 500 de `zones` — c'est le seul écart avec la forme de référence.
  let ranking: RaidRanking | null;
  try {
    const token = await getWCLToken(clientId, clientSecret);
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
