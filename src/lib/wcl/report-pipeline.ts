import type { WCLTable } from './parsers';
import type { BossResult, CharacterStats, FightTarget } from '@/types';
import { gql } from './client';
import { TOP_N, KILL_TIME_TOLERANCE } from './constants';
import { fmtMs, parseCasts, parseStats, parseUptime, summarizeRotation } from './parsers';
import { Q_COMBATANT, Q_DAMAGE, Q_ROTATION, Q_WORLD_RANKINGS } from './queries';

interface CombatantEvent {
  sourceID: number;
  specID: number;
  gear?: { itemLevel: number; id: number; quality: number }[];
  agility?: number;
  critMelee?: number;
  hasteMelee?: number;
  mastery?: number;
  versatilityDamageDone?: number;
  talentTree?: { id: number; rank?: number }[];
}

async function getCombatantByActor(
  token: string,
  code: string,
  fightId: number,
  actorId: number
): Promise<CombatantEvent | null> {
  const data = await gql<{
    reportData: { report: { events: { data: CombatantEvent[] } } };
  }>(token, Q_COMBATANT, { code, fightIDs: [fightId] });

  return data.reportData.report.events.data.find((e) => e.sourceID === actorId) ?? null;
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
  }>(token, Q_WORLD_RANKINGS, { encounterID: encounterId, difficulty });

  const charEvent = await getCombatantByActor(token, code, fightId, actorId);
  if (!charEvent) return null;

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
    }>(token, Q_DAMAGE, { code, fightIDs: [fightId], sourceID: actorId }),
    gql<{
      reportData: { report: { casts: WCLTable; buffs: WCLTable } };
    }>(token, Q_ROTATION, { code, fightIDs: [fightId], sourceID: actorId }),
  ]);

  const charStats = parseStats(charEvent, actorName);
  if (!charStats) return null;

  const charCasts = parseCasts(rotData.reportData.report.casts, fightMs);
  const charBuffs = parseUptime(rotData.reportData.report.buffs, fightMs);

  const allDmgEntries = dmgData.reportData.report.table.data?.entries ?? [];
  const myEntry = allDmgEntries.find((e) => e.guid === actorId || e.name === actorName);
  const bestDps = myEntry && fightMs > 0 ? Math.round(myEntry.total / (fightMs / 1000)) : 0;

  const charRotation = summarizeRotation(actorName, charCasts, charBuffs, fightMs, bestDps);

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
    .map(([name, { type, total }]) => ({
      name,
      type,
      damagePct: totalDamage > 0 ? Math.round((total / totalDamage) * 1000) / 10 : 0,
    }))
    .filter((t) => t.damagePct >= 1)
    .sort((a, b) => b.damagePct - a.damagePct);

  const worldData = await worldDataPromise;
  const allWorld = worldData.worldData.encounter.characterRankings.rankings ?? [];
  const lo = fightMs * (1 - KILL_TIME_TOLERANCE);
  const hi = fightMs * (1 + KILL_TIME_TOLERANCE);
  const similar = allWorld.filter((r) => r.duration >= lo && r.duration <= hi);
  const topPool = similar.length > 0 ? similar.slice(0, TOP_N) : allWorld.slice(0, TOP_N);

  const topPlayers = [];
  for (const player of topPool) {
    const { code: pCode, fightID: pFight } = player.report;
    if (!pCode || !pFight) continue;

    const pCombatantData = await gql<{
      reportData: { report: { events: { data: CombatantEvent[] } } };
    }>(token, Q_COMBATANT, { code: pCode, fightIDs: [pFight] });

    const pEvent = pCombatantData.reportData.report.events.data[0] ?? null;
    if (!pEvent) continue;

    const [pRot, pDmg] = await Promise.all([
      gql<{ reportData: { report: { casts: WCLTable; buffs: WCLTable } } }>(
        token,
        Q_ROTATION,
        { code: pCode, fightIDs: [pFight], sourceID: pEvent.sourceID }
      ),
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
    const pDamageEntries = (pDmg.reportData.report.table.data?.entries ?? [])
      .map((e) => ({ name: e.name, total: e.total }))
      .sort((a, b) => b.total - a.total);

    topPlayers.push({
      stats: {
        ...pStats,
        dps: Math.round(player.amount),
        killTime: fmtMs(player.duration),
      } as CharacterStats & { dps: number; killTime: string },
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
      bossDps: null,
      killTime: fmtMs(fightMs),
      overallPct: null,
      overallPctOf: null,
      todayPct: null,
      bossDpsPct: null,
      bracket: null,
    },
    topPlayers,
  };
}
