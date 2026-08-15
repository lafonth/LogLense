import type { AnalysisInput } from '@/types';
import { NextResponse } from 'next/server';
import { isNum, isOneOf, isRecord, isStr, readJson } from '@/lib/api/parse';
import { BOSS_ANALYSIS_UNITS, guardMeteredWclSpend } from '@/lib/api/wcl-guard';
import { recordExposure } from '@/lib/labels/record-exposure';
import { getWCLToken } from '@/lib/wcl/auth';
import { analyzeBoss } from '@/lib/wcl/pipeline';
import { characterSnapshotKey, readSnapshot, writeSnapshot } from '@/lib/wcl/result-snapshot';

export const runtime = 'nodejs';

interface AnalyzeBody {
  characterName: string;
  serverSlug: string;
  region: AnalysisInput['region'];
  difficulty: AnalysisInput['difficulty'];
  encounterName: string;
  specId: number;
  specIdOverride?: number;
  fightOverride?: { code: string; fightID: number };
  /**
   * Le lien ouvert portait la marque de partage. Autorise la lecture de l'instantané — elle
   * ne se fait jamais d'office : un raideur qui relance son analyse pendant la soirée doit
   * voir sa pull du moment, pas celle d'il y a deux heures.
   *
   * Ce n'est pas une frontière de sécurité, et la forger n'ouvre rien : l'appelant est
   * connecté, il pourrait lancer l'analyse lui-même.
   */
  preferSnapshot?: boolean;
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

  const {
    characterName,
    serverSlug,
    region,
    difficulty,
    encounterName,
    specId,
    specIdOverride,
    fightOverride,
    preferSnapshot,
  } = input;

  if (!isStr(characterName) || !isStr(serverSlug) || !isStr(encounterName)) return null;
  if (!isOneOf(region, REGIONS) || !isOneOf(difficulty, DIFFICULTIES)) return null;
  if (!isNum(specId)) return null;
  // Absent est légitime — c'est une surcharge. Présent et non numérique ne l'est pas.
  if (specIdOverride !== undefined && !isNum(specIdOverride)) return null;
  if (fightOverride !== undefined) {
    if (!isRecord(fightOverride)) return null;
    if (!isStr(fightOverride.code) || !isNum(fightOverride.fightID)) return null;
  }
  if (preferSnapshot !== undefined && typeof preferSnapshot !== 'boolean') return null;

  return {
    characterName,
    serverSlug,
    region,
    difficulty,
    encounterName,
    specId,
    specIdOverride,
    fightOverride: fightOverride as { code: string; fightID: number } | undefined,
    preferSnapshot,
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
  //
  // Le forfait est réservé, pas facturé : l'analyse tourne à l'intérieur du garde, qui règle
  // ensuite l'écart avec ce qui est réellement parti. Servi par les caches de référence, un
  // boss coûte une poignée d'appels — c'est ici que l'économie revient à l'utilisateur.
  return guardMeteredWclSpend('analyze', BOSS_ANALYSIS_UNITS, async () => {
    try {
      const snapshotKey = characterSnapshotKey({
        region: body.region,
        serverSlug: body.serverSlug,
        characterName: body.characterName,
        encounterId: encounterIdNum,
        difficulty: body.difficulty,
        specId: body.specId,
        specIdOverride: body.specIdOverride,
        fightOverride: body.fightOverride,
      });

      // Lu à l'intérieur du garde, jamais dans une route à part : la réservation a déjà refusé
      // l'appelant anonyme, ce qui est tout ce que §2a demande. Un instantané servi ne dépense
      // aucun appel WCL, et le règlement rend le forfait entier au quota du lecteur — le
      // partage devient gratuit pour lui, pas seulement pour la facture.
      if (body.preferSnapshot) {
        const snapshot = await readSnapshot(snapshotKey);
        if (snapshot) {
          // Un rendu a bien eu lieu : la capture part comme sur le chemin froid. Le `renderId`
          // que porte l'instantané relu est neuf, il ne se confond pas avec celui du partageur.
          await recordExposure([snapshot]).catch(() => {});
          return NextResponse.json(snapshot);
        }
      }

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
        body.specIdOverride,
        body.fightOverride
      );

      // Attendue, pas mise en `void` : sur un runtime serverless, une promesse non attendue
      // part avec la fonction, et c'est toute la classe positive qui disparaît. La provenance
      // du DPS vient du résultat ; ce chemin la fixe à `'ranking'` dans `pipeline.ts`.
      //
      // `recordExposure` avale déjà ses échecs ; le `catch` d'ici est la seconde barrière, à
      // l'intérieur du `try` qui rend un 500. La capture ne doit jamais coûter l'analyse.
      await recordExposure(result ? [result] : []).catch(() => {});

      // Écrit sur le chemin froid uniquement : réécrire un instantané qu'on vient de lire
      // repousserait son expiration à chaque ouverture du lien, et une durée de vie qu'on
      // prolonge indéfiniment n'est plus une copie de travail.
      if (result) await writeSnapshot(snapshotKey, result);

      return NextResponse.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Analysis failed';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
