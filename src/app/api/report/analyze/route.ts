import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { isNum, isRecord, isStr, readJson } from '@/lib/api/parse';
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

/**
 * Valide le corps, ou rend `null`.
 *
 * Chaque rencontre du tableau vaut une cinquantaine de requêtes chez WCL : ce qui n'a pas
 * la forme attendue doit être refusé avant le garde de dépense, pas découvert au milieu
 * du `Promise.all` par un `.catch(() => null)` qui a déjà payé.
 */
function parseBody(input: unknown): ReportAnalyzeBody | null {
  if (!isRecord(input)) return null;

  const { code, actorId, actorName, actorClass, specId, difficulty, encounters } = input;

  if (!isStr(code) || !isNum(actorId)) return null;
  if (!isStr(actorName) || !isStr(actorClass)) return null;
  if (!isNum(specId) || !isNum(difficulty)) return null;

  // Le plafond de rencontres reste à l'appelant : il a son propre message, qui dit au
  // client quoi faire, là où un `null` ne dirait que « non ».
  if (!Array.isArray(encounters) || encounters.length === 0) return null;

  const parsed: ReportAnalyzeBody['encounters'] = [];
  for (const enc of encounters) {
    if (!isRecord(enc)) return null;
    if (!isNum(enc.id) || !isStr(enc.name)) return null;
    if (!isNum(enc.fightId) || !isNum(enc.fightMs)) return null;
    parsed.push({ id: enc.id, name: enc.name, fightId: enc.fightId, fightMs: enc.fightMs });
  }

  return { code, actorId, actorName, actorClass, specId, difficulty, encounters: parsed };
}

export async function POST(req: NextRequest) {
  const body = parseBody(await readJson(req));

  if (!body) {
    return NextResponse.json({ error: 'Invalid analysis request' }, { status: 400 });
  }

  const { code, actorId, actorName, actorClass, specId, difficulty, encounters } = body;

  if (encounters.length > MAX_ENCOUNTERS_PER_REQUEST) {
    return NextResponse.json(
      { error: `At most ${MAX_ENCOUNTERS_PER_REQUEST} encounters per request` },
      { status: 400 }
    );
  }

  // Le `!` d'avant affirmait une variable d'environnement que rien ne garantit : absente,
  // le jeton partait avec `undefined` et WCL rendait un refus qu'on lisait comme une panne.
  //
  // Contrôlé avant le garde : une clé absente ne rend aucune analyse, donc facturer le quota
  // de l'appelant pour un 500 certain lui prendrait des unités qu'aucune requête n'a dépensées.
  const clientId = process.env.WCL_CLIENT_ID;
  const clientSecret = process.env.WCL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'WCL credentials not configured' }, { status: 500 });
  }

  // Le coût est proportionnel : la route éclate en un `Promise.all` sur les rencontres, et
  // une unité par requête HTTP laisserait un seul appel en acheter vingt fois cinquante.
  const refusal = await guardWclSpend(encounters.length * BOSS_ANALYSIS_UNITS);
  if (refusal) return refusal;

  try {
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

    // Attendue avant la réponse, pour la même raison que sur l'autre route. La provenance du
    // DPS est lue sur chaque résultat, pas affirmée ici : ce chemin retombe sur la table de
    // dégâts pour le seul joueur absent des classements du rapport.
    // Le `catch` double celui de `recordExposure` : c'est la seconde barrière, à l'intérieur
    // du `try` qui rend un 500. La capture ne doit jamais coûter l'analyse.
    await recordExposure(bosses).catch(() => {});

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
  } catch (error) {
    // Sans lui, l'échec du jeton partait en exception non rattrapée : le client lisait un 500
    // sans corps, là où l'autre route nomme la panne.
    const message = error instanceof Error ? error.message : 'Analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
