import type { BossResult } from '@/types';
import { randomUUID } from 'node:crypto';
import { getSpecInfo } from '@/lib/specs';
import { gql } from './client';
import { findCombatantByActorId } from './combatant';
import { fetchFightData } from './fight-data';
import { fetchHistoricalParse } from './historical-parse';
import { fmtMs } from './parsers';
import { Q_REPORT_RANKINGS_BOSSDPS, Q_REPORT_RANKINGS_DPS } from './queries';
import { fetchCandidatePool, resolveReferences } from './references';

/**
 * Une entrée de `report.rankings`. Les noms sont ceux de l'API, et deux d'entre eux
 * trompent :
 *
 * - `rankPercent` est le percentile **du jour**, recalculé contre la population courante —
 *   pas le percentile verrouillé que le joueur cite. Le chemin personnage lit un champ du
 *   même nom qui, lui, est historique. D'où `fetchHistoricalParse`.
 * - `totalParses` est la population **d'aujourd'hui**, pas celle de la partition. Le code
 *   lisait `rankTotalParses`, qui n'existe pas ici : la valeur était toujours `null`.
 */
interface RankingChar {
  name: string;
  amount: number;
  rankPercent: number;
  bracketData: number;
  totalParses?: number;
  server?: { name?: string; region?: string };
}

interface RankingsPayload {
  data: Array<{
    roles: {
      dps?: { characters: RankingChar[] };
      healers?: { characters: RankingChar[] };
      tanks?: { characters: RankingChar[] };
    };
  }>;
}

function findInRankings(payload: unknown, name: string): RankingChar | null {
  const p = payload as RankingsPayload | null;
  if (!p?.data?.[0]) return null;
  const { roles } = p.data[0];
  const all = [
    ...(roles.dps?.characters ?? []),
    ...(roles.healers?.characters ?? []),
    ...(roles.tanks?.characters ?? []),
  ];
  return all.find((c) => c.name === name) ?? null;
}

export async function analyzeReportBoss(
  token: string,
  code: string,
  encounterId: number,
  encounterName: string,
  actorId: number,
  actorName: string,
  fightId: number,
  fightMs: number,
  difficulty: number
): Promise<BossResult | null> {
  // Kick off report-specific fetches immediately (don't need spec info)
  const dpsRankingsPromise = gql<{ reportData: { report: { rankings: unknown } } }>(
    token,
    Q_REPORT_RANKINGS_DPS,
    { code, fightIDs: [fightId] }
  );

  const bossRankingsPromise = gql<{ reportData: { report: { rankings: unknown } } }>(
    token,
    Q_REPORT_RANKINGS_BOSSDPS,
    { code, fightIDs: [fightId] }
  );

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

  const { stats, rotation, damageEntries, fightTargets, dps, eligibility } = await fetchFightData(
    token,
    {
      code,
      fightId,
      combatant: charEvent,
      name: actorName,
      fightMs,
    }
  );

  const [pool, dpsRankingsRaw, bossRankingsRaw] = await Promise.all([
    poolPromise,
    dpsRankingsPromise,
    bossRankingsPromise,
  ]);

  // Extract per-player parse data from the report's own rankings
  const myDpsRank = findInRankings(dpsRankingsRaw.reportData.report.rankings, actorName);
  const myBossRank = findInRankings(bossRankingsRaw.reportData.report.rankings, actorName);

  // Le percentile verrouillé n'existe pas dans `report.rankings` : il faut le demander au
  // personnage, puis retrouver le parse du combat exact. Un échec ici (log privé, royaume
  // absent de l'entrée, panne WCL) dégrade vers le percentile du jour plutôt que d'annuler
  // l'analyse — mais alors les deux écrans annoncent des mesures différentes, et c'est le
  // seul cas où ça arrive.
  const historicalPromise =
    myDpsRank?.server?.name && myDpsRank.server.region
      ? fetchHistoricalParse(token, {
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
      : Promise.resolve(null);

  const { topPlayers, sample, comparability } = await resolveReferences(token, pool, {
    myIlvl: stats.avgIlvl,
    myKillTimeMs: fightMs,
    exclude: { code, fightID: fightId },
    mine: eligibility,
  });

  const historical = await historicalPromise;

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
      eligibility,
    },
    topPlayers,
    sample,
    comparability,
  };
}
