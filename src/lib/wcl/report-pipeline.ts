import type { BossResult } from '@/types';
import { getSpecInfo } from '@/lib/specs';
import { gql } from './client';
import { findCombatantByActorId } from './combatant';
import { fetchFightData } from './fight-data';
import { fmtMs } from './parsers';
import { Q_REPORT_RANKINGS_BOSSDPS, Q_REPORT_RANKINGS_DPS } from './queries';
import { fetchCandidatePool, resolveReferences } from './references';

interface RankingChar {
  name: string;
  amount: number;
  rankPercent: number;
  todayPercent: number;
  bracketData: number;
  rankTotalParses?: number | '?';
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

  const { topPlayers, sample, comparability } = await resolveReferences(token, pool, {
    myIlvl: stats.avgIlvl,
    myKillTimeMs: fightMs,
    exclude: { code, fightID: fightId },
    mine: eligibility,
  });

  return {
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
      overallPct: myDpsRank ? Math.round(myDpsRank.rankPercent * 10) / 10 : null,
      overallPctOf: myDpsRank ? (myDpsRank.rankTotalParses ?? null) : null,
      todayPct: myDpsRank ? Math.round(myDpsRank.todayPercent * 10) / 10 : null,
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
