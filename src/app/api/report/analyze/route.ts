import { NextRequest, NextResponse } from 'next/server';
import { getWCLToken } from '@/lib/wcl/auth';
import { analyzeReportBoss } from '@/lib/wcl/report-pipeline';

export const runtime = 'nodejs';

interface ReportAnalyzeBody {
  code: string;
  actorId: number;
  actorName: string;
  difficulty: number;
  encounters: { id: number; name: string; fightId: number; fightMs: number }[];
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ReportAnalyzeBody;
  const { code, actorId, actorName, difficulty, encounters } = body;

  if (!code || !actorId || !encounters?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const clientId = process.env.WCL_CLIENT_ID!;
  const clientSecret = process.env.WCL_CLIENT_SECRET!;
  const token = await getWCLToken(clientId, clientSecret);

  const bosses = await Promise.all(
    encounters.map((enc) =>
      analyzeReportBoss(
        token,
        code,
        enc.id,
        enc.name,
        actorId,
        actorName,
        enc.fightId,
        enc.fightMs,
        difficulty
      ).catch(() => null)
    )
  );

  return NextResponse.json({
    input: {
      characterName: actorName,
      serverSlug: '',
      region: 'EU',
      difficulty,
      encounters: encounters.map((e) => ({ id: e.id, name: e.name })),
    },
    bosses,
    generatedAt: new Date().toISOString(),
  });
}
