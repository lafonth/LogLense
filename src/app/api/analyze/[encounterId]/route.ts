import type { AnalysisInput } from '@/types';
import { NextResponse } from 'next/server';
import { isNum, isOneOf, isRecord, isStr, readJson } from '@/lib/api/parse';
import { BOSS_ANALYSIS_UNITS, guardWclSpend } from '@/lib/api/wcl-guard';
import { recordExposure } from '@/lib/labels/record-exposure';
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

const REGIONS: readonly AnalysisInput['region'][] = ['US', 'EU', 'KR', 'TW', 'CN'];
const DIFFICULTIES: readonly AnalysisInput['difficulty'][] = [3, 4, 5];

/**
 * Valide le corps champ par champ, ou rend `null`.
 *
 * Ce corps est ce qui décide d'une cinquantaine de requêtes chez WCL, sous la clé du
 * produit entier, dont la sanction est la révocation. Une région ou une difficulté hors
 * domaine part quand même chez WCL et s'y fait refuser : c'est de la dépense pour rien,
 * refusée ici plutôt que là-bas.
 */
function parseAnalyzeBody(input: unknown): AnalyzeBody | null {
  if (!isRecord(input)) return null;

  const { characterName, serverSlug, region, difficulty, encounterName, specId, specIdOverride } =
    input;

  if (!isStr(characterName) || !isStr(serverSlug) || !isStr(encounterName)) return null;
  if (!isOneOf(region, REGIONS) || !isOneOf(difficulty, DIFFICULTIES)) return null;
  if (!isNum(specId)) return null;
  // Absent est légitime — c'est une surcharge. Présent et non numérique ne l'est pas.
  if (specIdOverride !== undefined && !isNum(specIdOverride)) return null;

  return {
    characterName,
    serverSlug,
    region,
    difficulty,
    encounterName,
    specId,
    specIdOverride,
  };
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

  const body = parseAnalyzeBody(await readJson(req));

  if (!body) {
    return NextResponse.json({ error: 'Invalid analysis request' }, { status: 400 });
  }

  // Après validation, avant la première requête WCL : c'est la seule position où le quota
  // borne quelque chose. Un boss vaut une cinquantaine d'appels chez un tiers dont la
  // sanction porte sur la clé du produit entier.
  const refusal = await guardWclSpend(BOSS_ANALYSIS_UNITS);
  if (refusal) return refusal;

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

    // Attendue, pas mise en `void` : sur un runtime serverless, une promesse non attendue
    // part avec la fonction, et c'est toute la classe positive qui disparaît. Le chemin
    // personnage mesure le DPS par `ranks[].amount` — d'où `'ranking'`.
    //
    // `recordExposure` avale déjà ses échecs ; le `catch` d'ici est la seconde barrière, à
    // l'intérieur du `try` qui rend un 500. La capture ne doit jamais coûter l'analyse.
    await recordExposure(result ? [result] : [], { dpsSource: 'ranking' }).catch(() => {});

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
