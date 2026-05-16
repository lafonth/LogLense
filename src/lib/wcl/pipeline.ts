import type { WCLTable } from './parsers';
import type {
  AnalysisInput,
  AnalysisResult,
  BossResult,
  CharacterStats,
  FightTarget,
} from '@/types';
import { getSpecInfo } from '@/lib/specs';
import { getWCLToken } from './auth';
import { gql } from './client';
import { KILL_TIME_TOLERANCE, TOP_N } from './constants';
import { fmtMs, parseCasts, parseStats, parseUptime, summarizeRotation } from './parsers';
import {
  Q_CHARACTER_RANKINGS,
  Q_COMBATANT,
  Q_COMBATANT_WITH_ACTORS,
  Q_DAMAGE,
  Q_ROTATION,
  Q_WORLD_RANKINGS,
} from './queries';

interface CombatantEvent {
  sourceID: number;
  specID: number;
  gear?: { itemLevel: number; id: number; quality: number }[];
  agility?: number;
  strength?: number;
  intellect?: number;
  critMelee?: number;
  hasteMelee?: number;
  mastery?: number;
  versatilityDamageDone?: number;
  talentTree?: { id: number; rank?: number }[];
}

async function getCombatantBySpecId(
  token: string,
  code: string,
  fightId: number,
  specId: number
): Promise<CombatantEvent | null> {
  const data = await gql<{
    reportData: { report: { events: { data: CombatantEvent[] } } };
  }>(token, Q_COMBATANT, { code, fightIDs: [fightId] });

  return data.reportData.report.events.data.find((e) => e.specID === specId) ?? null;
}

async function getCombatantByName(
  token: string,
  code: string,
  fightId: number,
  characterName: string
): Promise<CombatantEvent | null> {
  const data = await gql<{
    reportData: {
      report: {
        events: { data: CombatantEvent[] };
        masterData: { actors: { id: number; name: string; type: string }[] };
      };
    };
  }>(token, Q_COMBATANT_WITH_ACTORS, { code, fightIDs: [fightId] });

  const actor = data.reportData.report.masterData.actors.find(
    (a) => a.name === characterName && a.type === 'Player'
  );
  if (!actor) return null;
  return data.reportData.report.events.data.find((e) => e.sourceID === actor.id) ?? null;
}

export async function analyzeBoss(
  token: string,
  input: AnalysisInput,
  encounterId: number,
  encounterName: string
): Promise<BossResult | null> {
  const { characterName: name, serverSlug: slug, region, difficulty, specId } = input;

  const fallbackSpec = getSpecInfo(specId);

  const charData = await gql<{
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
  }>(token, Q_CHARACTER_RANKINGS, { name, slug, region, encounterID: encounterId, difficulty });

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
  const charEvent = await getCombatantByName(token, bestCode, bestFightId, name);
  if (!charEvent) return null;

  const actualSpec = getSpecInfo(charEvent.specID) ?? fallbackSpec;
  if (!actualSpec) return null;
  const { specName, className } = actualSpec;

  const worldDataPromise = gql<{
    worldData: {
      encounter: {
        characterRankings: {
          rankings: Array<{
            name: string;
            amount: number;
            duration: number;
            report: { code: string; fightID: number };
          }>;
        };
      };
    };
  }>(token, Q_WORLD_RANKINGS, { encounterID: encounterId, difficulty, specName, className });

  const [dmgData, rotData] = await Promise.all([
    gql<{
      reportData: {
        report: {
          table: {
            data: {
              entries: {
                guid: number;
                name: string;
                total: number;
                targets?: { name: string; total: number; type: string }[];
              }[];
            };
          };
        };
      };
    }>(token, Q_DAMAGE, { code: bestCode, fightIDs: [bestFightId], sourceID: charEvent.sourceID }),
    gql<{
      reportData: {
        report: { casts: WCLTable; buffs: WCLTable };
      };
    }>(token, Q_ROTATION, {
      code: bestCode,
      fightIDs: [bestFightId],
      sourceID: charEvent.sourceID,
    }),
  ]);

  const charStats = parseStats(charEvent, name);
  if (!charStats) return null;

  const charCasts = parseCasts(rotData.reportData.report.casts, bestKillMs);
  const charBuffs = parseUptime(rotData.reportData.report.buffs, bestKillMs);
  const charRotation = summarizeRotation(name, charCasts, charBuffs, bestKillMs, bestDps);

  const allDmgEntries = dmgData.reportData.report.table.data?.entries ?? [];
  const damageEntries = allDmgEntries
    .map((e) => ({ name: e.name, total: e.total }))
    .sort((a, b) => b.total - a.total);

  const totalDamage = allDmgEntries.reduce((s, e) => s + e.total, 0);
  const targetMap = new Map<string, { type: string; total: number }>();
  for (const entry of allDmgEntries) {
    for (const t of entry.targets ?? []) {
      if (t.type === 'Player') continue;
      const existing = targetMap.get(t.name);
      if (existing) existing.total += t.total;
      else targetMap.set(t.name, { type: t.type, total: t.total });
    }
  }
  const fightTargets: FightTarget[] = [...targetMap.entries()]
    .map(([tname, { type, total }]) => ({
      name: tname,
      type,
      damagePct: totalDamage > 0 ? Math.round((total / totalDamage) * 1000) / 10 : 0,
    }))
    .filter((t) => t.damagePct >= 1)
    .sort((a, b) => b.damagePct - a.damagePct);

  const worldData = await worldDataPromise;
  const allWorld = worldData.worldData.encounter.characterRankings.rankings ?? [];
  const lo = bestKillMs * (1 - KILL_TIME_TOLERANCE);
  const hi = bestKillMs * (1 + KILL_TIME_TOLERANCE);
  const similar = allWorld.filter((r) => r.duration >= lo && r.duration <= hi);
  const topPool = similar.length > 0 ? similar.slice(0, TOP_N) : allWorld.slice(0, TOP_N);

  const topPlayers = [];
  for (const player of topPool) {
    const { code: pCode, fightID: pFight } = player.report;
    if (!pCode || !pFight) continue;

    const pEvent = await getCombatantBySpecId(token, pCode, pFight, specId);
    if (!pEvent) continue;

    const [pRot, pDmg] = await Promise.all([
      gql<{
        reportData: {
          report: { casts: WCLTable; buffs: WCLTable };
        };
      }>(token, Q_ROTATION, { code: pCode, fightIDs: [pFight], sourceID: pEvent.sourceID }),
      gql<{
        reportData: {
          report: { table: { data: { entries: { guid: number; name: string; total: number }[] } } };
        };
      }>(token, Q_DAMAGE, { code: pCode, fightIDs: [pFight], sourceID: pEvent.sourceID }),
    ]);

    const pStats = parseStats(pEvent, player.name);
    if (!pStats) continue;

    const pCasts = parseCasts(pRot.reportData.report.casts, player.duration);
    const pBuffs = parseUptime(pRot.reportData.report.buffs, player.duration);
    const pRotation = summarizeRotation(
      player.name,
      pCasts,
      pBuffs,
      player.duration,
      Math.round(player.amount)
    );

    const pStatsWithMeta: CharacterStats & { dps: number; killTime: string } = {
      ...pStats,
      dps: Math.round(player.amount),
      killTime: fmtMs(player.duration),
    };

    const pDamageEntries = (pDmg.reportData.report.table.data?.entries ?? [])
      .map((e) => ({ name: e.name, total: e.total }))
      .sort((a, b) => b.total - a.total);

    topPlayers.push({
      stats: pStatsWithMeta,
      rotation: pRotation,
      damageTable: { entries: pDamageEntries },
    });
  }

  return {
    encounter: encounterName,
    encounterId,
    fightTargets,
    character: {
      stats: charStats,
      rotation: charRotation,
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
