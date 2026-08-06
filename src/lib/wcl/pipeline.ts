import type { AnalysisInput, AnalysisResult, BossResult } from '@/types';
import { getSpecInfo } from '@/lib/specs';
import { getWCLToken } from './auth';
import { gql } from './client';
import { findCombatantByName } from './combatant';
import { fetchFightData } from './fight-data';
import { fmtMs } from './parsers';
import { Q_CHARACTER_RANKINGS, Q_CHARACTER_RANKINGS_SPEC } from './queries';
import { fetchCandidatePool, fetchReferencePlayers, selectReferences } from './references';

interface CharacterRankingsResponse {
  characterData: {
    character: {
      dps: {
        ranks: Array<{
          amount: number;
          duration: number;
          rankPercent: number;
          todayPercent: number;
          bracketData: number;
          rankTotalParses: number | '?';
          report: { code: string; fightID: number };
        }>;
      };
      boss: {
        ranks: Array<{
          amount: number;
          rankPercent: number;
          rankTotalParses: number | '?';
          report: { code: string; fightID: number };
        }>;
      };
    } | null;
  };
}

export async function analyzeBoss(
  token: string,
  input: AnalysisInput,
  encounterId: number,
  encounterName: string,
  specIdOverride?: number
): Promise<BossResult | null> {
  const { characterName: name, serverSlug: slug, region, difficulty, specId } = input;

  const fallbackSpec = getSpecInfo(specIdOverride ?? specId);

  // When a specific spec is requested, filter rankings to that spec only
  const overrideSpecInfo = specIdOverride ? getSpecInfo(specIdOverride) : null;

  const charData = await gql<CharacterRankingsResponse>(
    token,
    overrideSpecInfo ? Q_CHARACTER_RANKINGS_SPEC : Q_CHARACTER_RANKINGS,
    overrideSpecInfo
      ? {
          name,
          slug,
          region,
          encounterID: encounterId,
          difficulty,
          specName: overrideSpecInfo.specName,
          className: overrideSpecInfo.className,
        }
      : { name, slug, region, encounterID: encounterId, difficulty }
  );

  const char = charData.characterData.character;
  if (!char) return null;

  const dpsParses = char.dps?.ranks ?? [];
  const bossParses = char.boss?.ranks ?? [];
  if (dpsParses.length === 0) return null;

  const best = dpsParses.reduce((a, b) => (a.amount > b.amount ? a : b));
  const bestDps = Math.round(best.amount);
  const bestKillMs = best.duration;
  const bestCode = best.report.code;
  const bestFightId = best.report.fightID;

  const bossMatch =
    bossParses.find((p) => p.report.code === bestCode && p.report.fightID === bestFightId) ?? null;

  // Detect actual spec from combatant info — may differ from the form's selected spec
  const charEvent = await findCombatantByName(token, bestCode, bestFightId, name);
  if (!charEvent) return null;

  const actualSpec = getSpecInfo(charEvent.specID) ?? fallbackSpec;
  if (!actualSpec) return null;
  const { specName, className } = actualSpec;

  const poolPromise = fetchCandidatePool(token, {
    encounterId,
    difficulty,
    specName,
    className,
  });

  const { stats, rotation, damageEntries, fightTargets } = await fetchFightData(token, {
    code: bestCode,
    fightId: bestFightId,
    combatant: charEvent,
    name,
    fightMs: bestKillMs,
    dps: bestDps,
  });

  const pool = await poolPromise;
  const { references, comparability } = selectReferences(pool, {
    myIlvl: stats.avgIlvl,
    myKillTimeMs: bestKillMs,
    exclude: { code: bestCode, fightID: bestFightId },
  });
  const topPlayers = await fetchReferencePlayers(token, references);

  return {
    encounter: encounterName,
    encounterId,
    specId: charEvent.specID,
    fightTargets,
    character: {
      stats,
      rotation,
      damageTable: { entries: damageEntries },
      dps: bestDps,
      bossDps: bossMatch ? Math.round(bossMatch.amount) : null,
      killTime: fmtMs(bestKillMs),
      overallPct: Math.round(best.rankPercent * 10) / 10,
      overallPctOf: best.rankTotalParses,
      todayPct: Math.round(best.todayPercent * 10) / 10,
      bossDpsPct: bossMatch ? Math.round(bossMatch.rankPercent * 10) / 10 : null,
      bracket: best.bracketData,
    },
    topPlayers,
    comparability,
  };
}

export async function runAnalysis(input: AnalysisInput): Promise<AnalysisResult> {
  const clientId = process.env.WCL_CLIENT_ID;
  const clientSecret = process.env.WCL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('WCL_CLIENT_ID and WCL_CLIENT_SECRET environment variables are required');
  }

  const token = await getWCLToken(clientId, clientSecret);

  const bosses = await Promise.all(
    input.encounters.map((enc) => analyzeBoss(token, input, enc.id, enc.name).catch(() => null))
  );

  return {
    input,
    bosses,
    generatedAt: new Date().toISOString(),
  };
}
