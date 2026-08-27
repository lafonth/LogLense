import type { NextRequest } from 'next/server';
import type { BossResult, ReportSnapshotRef } from '@/types';
import { NextResponse } from 'next/server';
import { logRouteError } from '@/lib/api/log-error';
import { isNum, isRecord, isStr, readJson } from '@/lib/api/parse';
import {
  BOSS_ANALYSIS_UNITS,
  guardMeteredWclSpend,
  MAX_ENCOUNTERS_PER_REQUEST,
} from '@/lib/api/wcl-guard';
import { recordExposure } from '@/lib/labels/record-exposure';
import { getDpsSpecsForClass } from '@/lib/specs';
import { getWCLToken } from '@/lib/wcl/auth';
import { fetchReportCombatants } from '@/lib/wcl/combatant';
import { analyzeReportBoss } from '@/lib/wcl/report-pipeline';
import { fetchReportRankings } from '@/lib/wcl/report-rankings';
import { readSnapshot, reportSnapshotKey, writeSnapshot } from '@/lib/wcl/result-snapshot';

export const runtime = 'nodejs';

interface ReportAnalyzeBody {
  code: string;
  actorId: number;
  actorName: string;
  actorClass: string;
  specId: number;
  difficulty: number;
  encounters: { id: number; name: string; fightId: number; fightMs: number }[];
  /**
   * Le lien ouvert portait la marque de partage. Autorise la lecture des instantanés — elle
   * ne se fait jamais d'office : un raideur qui relance son analyse pendant la soirée doit
   * voir sa pull du moment, pas celle d'il y a deux heures.
   *
   * Ce n'est pas une frontière de sécurité, et la forger n'ouvre rien : l'appelant est
   * connecté, il pourrait lancer l'analyse lui-même.
   */
  preferSnapshot?: boolean;
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

  const { code, actorId, actorName, actorClass, specId, difficulty, encounters, preferSnapshot } =
    input;

  if (!isStr(code) || !isNum(actorId)) return null;
  if (!isStr(actorName) || !isStr(actorClass)) return null;
  if (!isNum(specId) || !isNum(difficulty)) return null;
  if (preferSnapshot !== undefined && typeof preferSnapshot !== 'boolean') return null;

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

  return {
    code,
    actorId,
    actorName,
    actorClass,
    specId,
    difficulty,
    encounters: parsed,
    preferSnapshot,
  };
}

export async function POST(req: NextRequest) {
  const body = parseBody(await readJson(req));

  if (!body) {
    return NextResponse.json({ error: 'Invalid analysis request' }, { status: 400 });
  }

  const { code, actorId, actorName, actorClass, specId, difficulty, encounters, preferSnapshot } =
    body;

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
  //
  // Réservé puis réglé, comme sur l'autre route — et le gain y est plus grand encore : les
  // rencontres d'un même rapport partagent leurs candidats d'une analyse à la suivante.
  const units = encounters.length * BOSS_ANALYSIS_UNITS;

  return guardMeteredWclSpend('report-analyze', units, async () => {
    try {
      // Les désignations d'abord, les clés ensuite : les deux ne peuvent plus diverger, et ce
      // sont ces mêmes désignations qui sont frappées sur les résultats pour que le chat les
      // renvoie.
      const refs: ReportSnapshotRef[] = encounters.map((enc) => ({
        kind: 'report',
        code,
        actorId,
        encounterId: enc.id,
        fightId: enc.fightId,
        difficulty,
      }));
      const snapshotKeys = refs.map((ref) => reportSnapshotKey(ref));

      // Lus à l'intérieur du garde, jamais dans une route à part : la réservation a déjà refusé
      // l'appelant anonyme, ce qui est tout ce que §2a demande. Un instantané servi ne dépense
      // aucun appel WCL, et le règlement rend au quota du lecteur le forfait de la rencontre —
      // le partage devient gratuit pour lui, pas seulement pour la facture.
      //
      // Rencontre par rencontre, pas tout ou rien : un rapport dont une seule pull a changé
      // sert les autres depuis l'instantané et ne recalcule que celle-là.
      const snapshots: (BossResult | null)[] = preferSnapshot
        ? await Promise.all(snapshotKeys.map((key) => readSnapshot(key)))
        : encounters.map(() => null);

      // Le jeton n'est demandé que s'il reste une rencontre à calculer : un lien entièrement
      // servi par les instantanés ne doit toucher ni l'API ni l'OAuth de Warcraft Logs.
      const token = snapshots.every((snap) => snap !== null)
        ? ''
        : await getWCLToken(clientId, clientSecret);

      // `report.rankings` et `events(dataType: CombatantInfo)` prennent tous deux une liste de
      // combats : les rencontres calculées à froid les demandent ensemble, trois requêtes pour
      // le rapport au lieu de trois par boss. Construit ici et non dans le pipeline, parce que
      // c'est ici qu'on sait quels combats partent ensemble — et seulement pour ceux-là : un
      // instantané servi ne doit toucher à rien.
      //
      // Le lot ne dépasse jamais `MAX_ENCOUNTERS_PER_REQUEST`, refusé plus haut : c'est ce qui
      // tient la réponse des combattants sous le seuil de pagination de `events`.
      const coldFightIds = encounters.filter((_, i) => !snapshots[i]).map((enc) => enc.fightId);
      const rankings =
        coldFightIds.length > 0 ? fetchReportRankings(token, code, coldFightIds) : undefined;
      const combatants =
        coldFightIds.length > 0 ? fetchReportCombatants(token, code, coldFightIds) : undefined;

      const analysed = await Promise.all(
        encounters.map(
          (enc, i) =>
            snapshots[i] ??
            analyzeReportBoss(
              token,
              code,
              enc.id,
              enc.name,
              actorId,
              actorName,
              enc.fightId,
              enc.fightMs,
              difficulty,
              rankings,
              combatants
            ).catch(() => null)
        )
      );

      // Frappée par la route, pas par le pipeline : `analyzeReportBoss` reçoit les champs de la
      // désignation éclatés en arguments, et ne les rassemble jamais. Réappliquée sans condition
      // aux rencontres servies par un instantané — la valeur y est déjà la même.
      const bosses = analysed.map((boss, i) => (boss ? { ...boss, snapshot: refs[i] } : null));

      // Écrit les seules rencontres calculées à froid : réécrire un instantané qu'on vient de
      // lire repousserait son expiration à chaque ouverture du lien, et une durée de vie qu'on
      // prolonge indéfiniment n'est plus une copie de travail.
      await Promise.all(
        bosses.map(async (boss, i) => {
          if (snapshots[i] || !boss) return;
          await writeSnapshot(snapshotKeys[i], boss);
        })
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
      logRouteError('report-analyze', error);
      const message = error instanceof Error ? error.message : 'Analysis failed';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
