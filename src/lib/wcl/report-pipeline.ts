import type { ReportRankings } from './report-rankings';
import type { BossResult } from '@/types';
import { randomUUID } from 'node:crypto';
import { getSpecInfo } from '@/lib/specs';
import { findCombatantByActorId } from './combatant';
import { fetchFightData } from './fight-data';
import { fetchCharacterHistory } from './historical-parse';
import { fmtMs } from './parsers';
import { fetchCandidatePool, resolveReferences } from './references';
import { fetchReportRankings } from './report-rankings';

export async function analyzeReportBoss(
  token: string,
  code: string,
  encounterId: number,
  encounterName: string,
  actorId: number,
  actorName: string,
  fightId: number,
  fightMs: number,
  difficulty: number,
  /**
   * Les classements du rapport, partagés par toutes les rencontres analysées ensemble. Absent,
   * chaque rencontre reprend les siens : le chemin d'une analyse isolée reste une écriture
   * directe, sans que l'appelant ait à monter un lot d'un seul combat.
   */
  rankings: ReportRankings = fetchReportRankings(token, code, [fightId])
): Promise<BossResult | null> {
  // Detect actual spec from combatant data before starting world rankings
  const charEvent = await findCombatantByActorId(token, code, fightId, actorId);
  if (!charEvent) return null;

  const specInfo = getSpecInfo(charEvent.specID);
  if (!specInfo) return null;
  const { specName, className } = specInfo;

  const poolPromise = fetchCandidatePool(token, {
    encounterId,
    difficulty,
    specName,
    className,
  });

  // Le DPS du sujet doit sortir de la même mesure que celui des références — le montant des
  // classements WCL — sinon l'écart affiché soustrait deux mesures différentes. D'où
  // l'attente ici, avant les données de combat : la requête est en vol depuis la construction
  // du lot, et `dps` ne sert pas qu'à l'affichage, il traverse `summarizeRotation`. Le
  // corriger après coup laisserait la rotation sur l'autre mesure.
  const myDpsRank = await rankings.dps(fightId, actorName);

  // `undefined` et non `0` : c'est ce qui rend la main à la dérivation depuis la table de
  // dégâts quand le classement n'a rien sur ce joueur. Le repli est moins comparable, il
  // reste préférable à un DPS nul, et `dpsSource` le déclare.
  const rankingDps = myDpsRank ? Math.round(myDpsRank.amount) : undefined;

  const { stats, rotation, damageEntries, fightTargets, dps, eligibility, context } =
    await fetchFightData(token, {
      code,
      fightId,
      combatant: charEvent,
      name: actorName,
      fightMs,
      dps: rankingDps,
      context: { encounterId, difficulty },
    });

  const [pool, myBossRank] = await Promise.all([poolPromise, rankings.bossDps(fightId, actorName)]);

  // Le percentile verrouillé n'existe pas dans `report.rankings` : il faut le demander au
  // personnage, puis retrouver le parse du combat exact. Un échec ici (log privé, royaume
  // absent de l'entrée, panne WCL) dégrade vers le percentile du jour plutôt que d'annuler
  // l'analyse — mais alors les deux écrans annoncent des mesures différentes, et c'est le
  // seul cas où ça arrive.
  const historyPromise =
    myDpsRank?.server?.name && myDpsRank.server.region
      ? fetchCharacterHistory(token, {
          name: actorName,
          serverName: myDpsRank.server.name,
          regionSlug: myDpsRank.server.region,
          encounterId,
          difficulty,
          specName,
          className,
          code,
          fightID: fightId,
        })
      : Promise.resolve({ parse: null, trajectory: [] });

  const { topPlayers, sample, comparability } = await resolveReferences(token, pool, {
    myIlvl: stats.avgIlvl,
    myKillTimeMs: fightMs,
    exclude: { code, fightID: fightId },
    mine: eligibility,
    context: { encounterId, difficulty, specId: charEvent.specID },
  });

  const { parse: historical, trajectory } = await historyPromise;

  return {
    renderId: randomUUID(),
    encounter: encounterName,
    encounterId,
    specId: charEvent.specID,
    difficulty,
    fightTargets,
    character: {
      stats,
      rotation,
      damageTable: { entries: damageEntries },
      dps,
      dpsSource: rankingDps === undefined ? 'damage-table' : 'ranking',
      bossDps: myBossRank ? Math.round(myBossRank.amount) : null,
      killTime: fmtMs(fightMs),
      overallPct: historical
        ? Math.round(historical.rankPercent * 10) / 10
        : myDpsRank
          ? Math.round(myDpsRank.rankPercent * 10) / 10
          : null,
      overallPctOf: historical ? historical.rankTotalParses : (myDpsRank?.totalParses ?? null),
      todayPct: myDpsRank ? Math.round(myDpsRank.rankPercent * 10) / 10 : null,
      bossDpsPct: myBossRank ? Math.round(myBossRank.rankPercent * 10) / 10 : null,
      bracket: myDpsRank ? Math.round(myDpsRank.bracketData * 10) / 10 : null,
      source: { code, fightID: fightId, actorId: charEvent.sourceID },
      // Même réponse que le percentile verrouillé : quand la réconciliation échoue, la
      // trajectoire tombe avec elle, et l'écran retombe sur le rapport isolé.
      trajectory,
      eligibility,
      context,
    },
    topPlayers,
    sample,
    comparability,
  };
}
