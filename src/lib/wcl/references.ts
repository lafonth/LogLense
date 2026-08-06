import type { ScoredCandidate } from './comparability';
import type { Comparability, TopPlayer } from '@/types';
import { gql } from './client';
import { findCombatantByName } from './combatant';
import { comparabilityLevel, medianOf, selectClosest } from './comparability';
import { CANDIDATE_PAGES, TOP_N } from './constants';
import { fetchFightData } from './fight-data';
import { fmtMs } from './parsers';
import { Q_WORLD_RANKINGS } from './queries';

export interface WorldRanking {
  name: string;
  amount: number;
  duration: number;
  bracketData?: number;
  report: { code: string; fightID: number };
}

export interface CandidatePool {
  candidates: WorldRanking[];
  pagesFetched: number;
}

interface RankingsResponse {
  worldData: { encounter: { characterRankings: { rankings?: WorldRanking[] } } };
}

/**
 * Builds the candidate pool by fetching CANDIDATE_PAGES pages in parallel.
 *
 * One page is 100 entries and the world rankings are ordered by damage, so the
 * players comparable to an under-geared character sit several pages deep — a
 * single page contains only the best-equipped. A page that fails is skipped
 * rather than failing the analysis, and pagesFetched reports what was obtained.
 */
export async function fetchCandidatePool(
  token: string,
  args: { encounterId: number; difficulty: number; specName: string; className: string }
): Promise<CandidatePool> {
  const pages = await Promise.all(
    Array.from({ length: CANDIDATE_PAGES }, (_, i) =>
      gql<RankingsResponse>(token, Q_WORLD_RANKINGS, {
        encounterID: args.encounterId,
        difficulty: args.difficulty,
        specName: args.specName,
        className: args.className,
        page: i + 1,
      })
        .then((data) => data.worldData.encounter.characterRankings.rankings ?? [])
        .catch(() => null)
    )
  );

  const seen = new Set<string>();
  const candidates: WorldRanking[] = [];
  let pagesFetched = 0;

  for (const page of pages) {
    if (page === null) continue;
    pagesFetched += 1;
    for (const entry of page) {
      const key = `${entry.report.code}:${entry.report.fightID}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(entry);
    }
  }

  return { candidates, pagesFetched };
}

export interface ReferenceSelection {
  references: ScoredCandidate<WorldRanking>[];
  comparability: Comparability;
}

/**
 * Picks the references a character is compared against — the candidates closest to
 * them in item level and kill time, not the ones with the highest damage — and reports
 * how legitimate the resulting comparison is.
 *
 * `exclude` is the player's own log. It sits in the candidate pool whenever their parse
 * ranks inside the fetched pages, and it scores a perfect zero distance against itself,
 * so without this it would be selected as the closest reference and the banner would
 * call a self-comparison `close`.
 */
export function selectReferences(
  pool: CandidatePool,
  args: {
    myIlvl: number;
    myKillTimeMs: number;
    exclude: { code: string; fightID: number };
  }
): ReferenceSelection {
  const { myIlvl, myKillTimeMs, exclude } = args;

  const filtered = pool.candidates.filter(
    (c) => !(c.report.code === exclude.code && c.report.fightID === exclude.fightID)
  );

  const scored = selectClosest(filtered, myIlvl, myKillTimeMs, TOP_N);

  const comparability: Comparability = {
    level: comparabilityLevel(scored),
    referenceIlvl: medianOf(
      scored.map((s) => s.candidate.bracketData).filter((v): v is number => v !== undefined)
    ),
    myIlvl,
    referenceKillTimeMs: medianOf(scored.map((s) => s.candidate.duration)),
    myKillTimeMs,
    candidatesConsidered: filtered.length,
    pagesFetched: pool.pagesFetched,
  };

  return { references: scored, comparability };
}

/**
 * Fetches each reference player's fight in turn. Sequential on purpose for now:
 * widening the candidate window and parallelising it is a separate change.
 */
export async function fetchReferencePlayers(
  token: string,
  pool: ScoredCandidate<WorldRanking>[]
): Promise<TopPlayer[]> {
  const players: TopPlayer[] = [];

  for (const { candidate, distance } of pool) {
    const { code, fightID } = candidate.report;
    if (!code || !fightID) continue;

    // By name, not by spec: the ranking names one player, but a raid can field two of
    // the same spec. Matching on spec returned whichever came first, so the panel could
    // show this candidate's name and damage beside another player's gear, talents and
    // rotation — including the item level the whole selection is built on. A candidate
    // we cannot identify is dropped rather than substituted.
    const combatant = await findCombatantByName(token, code, fightID, candidate.name);
    if (!combatant) continue;

    const dps = Math.round(candidate.amount);
    const { stats, rotation, damageEntries } = await fetchFightData(token, {
      code,
      fightId: fightID,
      combatant,
      name: candidate.name,
      fightMs: candidate.duration,
      dps,
    });

    players.push({
      stats: { ...stats, dps, killTime: fmtMs(candidate.duration) },
      rotation,
      damageTable: { entries: damageEntries },
      provenance: {
        code,
        fightID,
        name: candidate.name,
        ilvl: candidate.bracketData ?? null,
        killTimeMs: candidate.duration,
        dps,
        distance,
      },
    });
  }

  return players;
}
