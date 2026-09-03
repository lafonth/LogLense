import type { AnalysisInput, AnalysisResult, BossOutcome } from '@/types';
import { randomUUID } from 'node:crypto';
import { unsupportedSpecRefusal } from '@/lib/boss-outcome';
import { getSpecInfo } from '@/lib/specs';
import { getWCLToken } from './auth';
import { gql } from './client';
import { findCombatantByName } from './combatant';
import { fetchFightData } from './fight-data';
import { fmtMs } from './parsers';
import { Q_CHARACTER_RANKINGS, Q_CHARACTER_RANKINGS_SPEC } from './queries';
import { fetchCandidatePool, resolveReferences } from './references';
import { parseTrajectory } from './trajectory';

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
  specIdOverride?: number,
  fightOverride?: { code: string; fightID: number }
): Promise<BossOutcome | null> {
  const { characterName: name, serverSlug: slug, region, difficulty } = input;

  // When a specific spec is requested, filter rankings to that spec only
  const overrideSpecInfo = specIdOverride === undefined ? null : getSpecInfo(specIdOverride);

  // Refusé avant la première requête : la surcharge vient de l'écran, et une spec que nous
  // ne savons pas analyser ne doit pas acheter une cinquantaine d'appels chez WCL pour se
  // faire refuser ensuite.
  if (specIdOverride !== undefined && !overrideSpecInfo?.supported) {
    return unsupportedSpecRefusal(encounterId, encounterName, specIdOverride);
  }

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

  // La surcharge doit exister dans le pool reçu — un pool a pu bouger entre deux requêtes.
  // À défaut, on retombe sur le meilleur parse plutôt que d'échouer silencieusement.
  const overridden = fightOverride
    ? dpsParses.find(
        (p) => p.report.code === fightOverride.code && p.report.fightID === fightOverride.fightID
      )
    : null;
  const best = overridden ?? dpsParses.reduce((a, b) => (a.amount > b.amount ? a : b));
  const bestDps = Math.round(best.amount);
  const bestKillMs = best.duration;
  const bestCode = best.report.code;
  const bestFightId = best.report.fightID;

  const bossMatch =
    bossParses.find((p) => p.report.code === bestCode && p.report.fightID === bestFightId) ?? null;

  // Detect actual spec from combatant info — may differ from the form's selected spec
  const charEvent = await findCombatantByName(token, bestCode, bestFightId, name);
  if (!charEvent) return null;

  // Le log gagne sur le formulaire. `?? fallbackSpec` retombait sur la spec choisie à la
  // main quand le `CombatantInfo` en donnait une que la table ignorait — c'est ce repli qui
  // a comparé une Prêtre Sacré à des Prêtres Ombre et rendu un rapport cohérent, confiant,
  // entièrement faux. Refusé ici, avant `fetchCandidatePool` : un refus qui a déjà coûté
  // cinquante requêtes WCL est un refus mal placé.
  const actualSpec = getSpecInfo(charEvent.specID);
  if (!actualSpec?.supported) {
    return unsupportedSpecRefusal(encounterId, encounterName, charEvent.specID);
  }
  const { specName, className } = actualSpec;

  const { stats, rotation, damageEntries, fightTargets, eligibility, context } =
    await fetchFightData(token, {
      code: bestCode,
      fightId: bestFightId,
      combatant: charEvent,
      name,
      fightMs: bestKillMs,
      dps: bestDps,
      context: { encounterId, difficulty },
    });

  // Séquentiel, et c'est le prix assumé du filtrage à la source : le vivier se demande
  // maintenant avec l'ilvl du sujet et avec ce qu'il a reçu comme externals, dont aucun n'est
  // connu avant `fetchFightData`. Ce qu'on perd est de la latence, jamais une requête — et le
  // vivier filtré en rend bien davantage, puisqu'il tient dans la tolérance au lieu de la
  // croiser. Voir l'en-tête de `fetchCandidatePool`.
  const pool = await fetchCandidatePool(token, {
    encounterId,
    difficulty,
    specName,
    className,
    myIlvl: stats.avgIlvl,
    excludeExternals: eligibility.externalUptime === 0,
  });
  const { topPlayers, sample, comparability } = await resolveReferences(token, pool, {
    myIlvl: stats.avgIlvl,
    myKillTimeMs: bestKillMs,
    exclude: { code: bestCode, fightID: bestFightId },
    mine: eligibility,
    context: { encounterId, difficulty, specId: charEvent.specID },
  });

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
      dps: bestDps,
      // `bestDps` sort de `encounterRankings` : même mesure que les références, toujours.
      dpsSource: 'ranking',
      bossDps: bossMatch ? Math.round(bossMatch.amount) : null,
      killTime: fmtMs(bestKillMs),
      overallPct: Math.round(best.rankPercent * 10) / 10,
      overallPctOf: best.rankTotalParses,
      todayPct: Math.round(best.todayPercent * 10) / 10,
      bossDpsPct: bossMatch ? Math.round(bossMatch.rankPercent * 10) / 10 : null,
      bracket: best.bracketData,
      source: { code: bestCode, fightID: bestFightId, actorId: charEvent.sourceID },
      // Les mêmes `ranks` que ceux qui ont désigné le meilleur parse : la trajectoire est
      // déjà payée. Le point analysé est donc, par construction, le sommet de sa courbe.
      trajectory: parseTrajectory(char.dps, { code: bestCode, fightID: bestFightId }),
      eligibility,
      context,
    },
    topPlayers,
    sample,
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
