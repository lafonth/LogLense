import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  BOSS_ANALYSIS_UNITS,
  guardWclSpend,
  MAX_ENCOUNTERS_PER_REQUEST,
} from '@/lib/api/wcl-guard';
import { recordExposure } from '@/lib/labels/record-exposure';
import { getDpsSpecsForClass } from '@/lib/specs';
import { getWCLToken } from '@/lib/wcl/auth';
import { analyzeReportBoss } from '@/lib/wcl/report-pipeline';

export const runtime = 'nodejs';

interface ReportAnalyzeBody {
  code: string;
  actorId: number;
  actorName: string;
  actorClass: string;
  specId: number;
  difficulty: number;
  encounters: { id: number; name: string; fightId: number; fightMs: number }[];
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ReportAnalyzeBody;
  const { code, actorId, actorName, actorClass, specId, difficulty, encounters } = body;

  if (!code || !actorId || !encounters?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (encounters.length > MAX_ENCOUNTERS_PER_REQUEST) {
    return NextResponse.json(
      { error: `At most ${MAX_ENCOUNTERS_PER_REQUEST} encounters per request` },
      { status: 400 }
    );
  }

  // Le coût est proportionnel : la route éclate en un `Promise.all` sur les rencontres, et
  // une unité par requête HTTP laisserait un seul appel en acheter vingt fois cinquante.
  const refusal = await guardWclSpend(encounters.length * BOSS_ANALYSIS_UNITS);
  if (refusal) return refusal;

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

  // Resolve specId: use provided specId if valid, else fall back to first DPS spec for the class.
  // Si la classe elle-même est inconnue, on renvoie 0 : le prompt sait dire « spec inconnue »,
  // il ne sait pas rattraper une spec affirmée à tort.
  const resolvedSpecId = specId || getDpsSpecsForClass(actorClass)[0]?.specId || 0;

  // Attendue avant la réponse, pour la même raison que sur l'autre route. Ici le DPS du
  // sujet sort de la table de dégâts calculée par `fetchFightData`, pas d'un classement.
  // Le `catch` double celui de `recordExposure` : cette route n'en a aucun autre.
  await recordExposure(bosses, { dpsSource: 'damage-table' }).catch(() => {});

  return NextResponse.json({
    input: {
      characterName: actorName,
      serverSlug: '',
      region: 'EU',
      difficulty,
      encounters: encounters.map((e) => ({ id: e.id, name: e.name })),
      specId: resolvedSpecId,
    },
    bosses,
    generatedAt: new Date().toISOString(),
  });
}
