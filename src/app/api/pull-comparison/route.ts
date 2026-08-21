import type { NextRequest } from 'next/server';
import type { PullPointer } from '@/lib/wcl/pull-pipeline';
import { NextResponse } from 'next/server';
import { isNum, isRecord, isStr, readJson } from '@/lib/api/parse';
import { guardWclSpend, PULL_COMPARISON_UNITS } from '@/lib/api/wcl-guard';
import { recordPullComparison } from '@/lib/labels/record-pull-comparison';
import { getWCLToken } from '@/lib/wcl/auth';
import { fetchPullComparison } from '@/lib/wcl/pull-pipeline';

export const runtime = 'nodejs';

interface PullComparisonBody {
  specId: number;
  before: PullPointer;
  after: PullPointer;
}

function parsePointer(input: unknown): PullPointer | null {
  if (!isRecord(input)) return null;

  const { code, fightId, actorId, name, fightMs, encounterId, difficulty } = input;

  if (!isStr(code) || !isNum(fightId) || !isNum(actorId)) return null;
  if (!isStr(name) || !isNum(fightMs)) return null;
  if (!isNum(encounterId) || !isNum(difficulty)) return null;

  return { code, fightId, actorId, name, fightMs, encounterId, difficulty };
}

/**
 * Valide le corps, ou rend `null`. Deux pointeurs de pull, pas de rencontre à multiplier :
 * contrairement à `report/analyze`, le coût de cette route est fixe.
 */
function parseBody(input: unknown): PullComparisonBody | null {
  if (!isRecord(input)) return null;

  const { specId, before, after } = input;
  if (!isNum(specId)) return null;

  const parsedBefore = parsePointer(before);
  const parsedAfter = parsePointer(after);
  if (!parsedBefore || !parsedAfter) return null;

  return { specId, before: parsedBefore, after: parsedAfter };
}

export async function POST(req: NextRequest) {
  const body = parseBody(await readJson(req));

  if (!body) {
    return NextResponse.json({ error: 'Invalid comparison request' }, { status: 400 });
  }

  const { specId, before, after } = body;

  // Les identifiants d'abord, le quota ensuite : une configuration absente ne doit rien
  // prélever. C'est la forme de `zones/route.ts`, et la leçon de C2.
  const clientId = process.env.WCL_CLIENT_ID;
  const clientSecret = process.env.WCL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'WCL credentials not configured' }, { status: 500 });
  }

  const refusal = await guardWclSpend('pull-comparison', PULL_COMPARISON_UNITS);
  if (refusal) return refusal;

  try {
    const token = await getWCLToken(clientId, clientSecret);

    const result = await fetchPullComparison(token, before, after, specId);

    if (!result) {
      return NextResponse.json({ error: 'Pull not found' }, { status: 404 });
    }

    // Attendue avant la réponse, même contrat que `recordExposure` sur l'autre route : un
    // corpus qui échoue à écrire ne doit jamais faire échouer l'écran.
    await recordPullComparison(before, after, specId).catch(() => {});

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to compare pulls';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
