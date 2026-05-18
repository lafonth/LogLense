import type { AnalysisInput } from '@/types';
import { NextResponse } from 'next/server';
import { getWCLToken } from '@/lib/wcl/auth';
import { analyzeBoss } from '@/lib/wcl/pipeline';

export const runtime = 'nodejs';

interface AnalyzeBody {
  characterName: string;
  serverSlug: string;
  region: AnalysisInput['region'];
  difficulty: AnalysisInput['difficulty'];
  encounterName: string;
  specId: number;
  specIdOverride?: number;
}

export async function POST(req: Request, { params }: { params: Promise<{ encounterId: string }> }) {
  const { encounterId } = await params;
  const encounterIdNum = Number.parseInt(encounterId, 10);

  if (Number.isNaN(encounterIdNum)) {
    return NextResponse.json({ error: 'Invalid encounter ID' }, { status: 400 });
  }

  const clientId = process.env.WCL_CLIENT_ID;
  const clientSecret = process.env.WCL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'WCL credentials not configured' }, { status: 500 });
  }

  const body = (await req.json()) as AnalyzeBody;

  if (!body.specId || typeof body.specId !== 'number') {
    return NextResponse.json({ error: 'specId is required' }, { status: 400 });
  }

  try {
    const token = await getWCLToken(clientId, clientSecret);

    const input: AnalysisInput = {
      characterName: body.characterName,
      serverSlug: body.serverSlug,
      region: body.region,
      difficulty: body.difficulty,
      encounters: [{ id: encounterIdNum, name: body.encounterName }],
      specId: body.specId,
    };

    const result = await analyzeBoss(
      token,
      input,
      encounterIdNum,
      body.encounterName,
      body.specIdOverride
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
