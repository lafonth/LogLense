import type { CombatantEvent } from './combatant';
import type { ScoredCandidate } from './comparability';
import type { DisqualificationReason, EligibilityProfile } from './eligibility';
import type { WCLTable } from './parsers';
import type { Comparability, ReferenceSample, TopPlayer } from '@/types';
import { gql } from './client';
import { findCombatantByName } from './combatant';
import { comparabilityLevel, medianOf, selectClosest } from './comparability';
import { CANDIDATE_PAGES, EXPLORATION_RATE, TOP_N, VERIFICATION_WINDOW } from './constants';
import { disqualify, eligibilityOf } from './eligibility';
import { fetchFightData } from './fight-data';
import { fmtMs, parseStats } from './parsers';
import { Q_BUFFS, Q_WORLD_RANKINGS } from './queries';

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

export interface ResolvedReferences {
  topPlayers: TopPlayer[];
  sample: ReferenceSample[];
  comparability: Comparability;
}

interface VerifiedCandidate {
  scored: ScoredCandidate<WorldRanking>;
  combatant: CombatantEvent;
  profile: EligibilityProfile;
  disqualifiedBy: DisqualificationReason[];
  /** Tiré hors fenêtre plutôt que sélectionné. Porté jusqu'au corpus, jamais perdu en route. */
  explored: boolean;
}

/**
 * Tire un candidat hors de la fenêtre de vérification, ou rien.
 *
 * Le corpus n'apprend rien d'un sélecteur qui ne montre que ce qu'il approuve déjà : sans
 * candidat lointain jamais montré, il n'existe aucune observation contredisant la règle de
 * distance, et un modèle entraîné dessus la recopie au lieu de la corriger.
 *
 * Le tirage se limite aux candidats scorables. Un `Infinity` dit « je n'ai pas pu juger »,
 * pas « c'est loin » : l'explorer testerait l'absence de `bracketData`, pas l'hypothèse.
 */
function pickExploration(
  beyond: ScoredCandidate<WorldRanking>[],
  random: () => number
): ScoredCandidate<WorldRanking> | null {
  if (random() >= EXPLORATION_RATE) return null;
  const scorable = beyond.filter((s) => Number.isFinite(s.distance));
  if (scorable.length === 0) return null;
  // Borné : `random()` rendant exactement 1 sortirait du tableau.
  return scorable[Math.min(scorable.length - 1, Math.floor(random() * scorable.length))];
}

/**
 * Reads what the ranking cannot say about one candidate: the tier set they wore and the
 * offensive externals they were handed.
 *
 * Two queries, both needed before the candidate can be judged — the buff table is keyed
 * on the source id the combatant event carries. A candidate that cannot be identified,
 * or whose report refuses either query, is dropped rather than substituted: matching on
 * spec would put this candidate's name and damage beside another player's gear.
 */
async function verifyCandidate(
  token: string,
  scored: ScoredCandidate<WorldRanking>,
  mine: EligibilityProfile,
  explored: boolean
): Promise<VerifiedCandidate | null> {
  const { candidate } = scored;
  const { code, fightID } = candidate.report;
  if (!code || !fightID) return null;

  try {
    const combatant = await findCombatantByName(token, code, fightID, candidate.name);
    if (!combatant) return null;

    const data = await gql<{ reportData: { report: { buffs: WCLTable } } }>(token, Q_BUFFS, {
      code,
      fightIDs: [fightID],
      sourceID: combatant.sourceID,
    });

    const profile = eligibilityOf(combatant, data.reportData.report.buffs, candidate.duration);
    return { scored, combatant, profile, disqualifiedBy: disqualify(profile, mine), explored };
  } catch {
    return null;
  }
}

/**
 * L'échantillon statistique, tiré de toute la fenêtre vérifiée.
 *
 * `parseStats` ne lit que le `CombatantInfo`, déjà payé pour juger le candidat : stats et
 * talents des douze coûtent zéro requête de plus, là où dégâts et rotation en coûteraient
 * quatre fois plus que le panel. C'est ce qui rend l'agrégation gratuite — et c'est aussi
 * pourquoi elle s'arrête aux stats et aux talents.
 */
function sampleOf(verified: VerifiedCandidate[]): ReferenceSample[] {
  return verified.flatMap((v) => {
    const { candidate } = v.scored;
    const stats = parseStats(v.combatant, candidate.name);
    if (!stats) return [];
    return [
      {
        name: candidate.name,
        code: candidate.report.code,
        fightID: candidate.report.fightID,
        actorId: v.combatant.sourceID,
        stats,
        dps: Math.round(candidate.amount),
        killTimeMs: candidate.duration,
        qualified: v.disqualifiedBy.length === 0,
        explored: v.explored,
      },
    ];
  });
}

async function buildTopPlayer(token: string, verified: VerifiedCandidate): Promise<TopPlayer> {
  const { scored, combatant, profile, disqualifiedBy, explored } = verified;
  const { candidate, distance } = scored;
  const { code, fightID } = candidate.report;

  const dps = Math.round(candidate.amount);
  const { stats, rotation, damageEntries } = await fetchFightData(token, {
    code,
    fightId: fightID,
    combatant,
    name: candidate.name,
    fightMs: candidate.duration,
    dps,
  });

  return {
    stats: { ...stats, dps, killTime: fmtMs(candidate.duration) },
    rotation,
    damageTable: { entries: damageEntries },
    provenance: {
      code,
      fightID,
      actorId: combatant.sourceID,
      name: candidate.name,
      ilvl: candidate.bracketData ?? null,
      killTimeMs: candidate.duration,
      dps,
      distance,
      disqualifiedBy,
      tierPieces: profile.tierPieces,
      externalUptime: profile.externalUptime,
      explored,
    },
  };
}

/**
 * Picks the references a character is compared against, and fetches them.
 *
 * Two stages, because the eliminatory criteria are invisible in the ranking. The whole
 * pool is scored on item level and kill time, then a window of the closest is verified —
 * set bonus and externals — and only the survivors are worth fetching damage for. The
 * window is the price of the criteria: candidates eliminated here cost two queries each
 * and never reach the expensive fetch.
 *
 * `exclude` is the player's own log. It sits in the candidate pool whenever their parse
 * ranks inside the fetched pages, and it scores a perfect zero distance against itself,
 * so without this it would be selected as the closest reference and the banner would
 * call a self-comparison `close`.
 *
 * When fewer than TOP_N candidates survive, the panel is completed with the best
 * eliminated ones rather than left short — but the comparison drops to `poor` and each
 * substituted reference carries the reason it should not have been there. A full panel
 * that stays silent about what it is made of is the failure this is built to avoid.
 *
 * Le panel est le sous-produit cher : `sample` porte toute la fenêtre, parce que la
 * question posée à l'écran est « où je me situe dans la distribution », pas « voici trois
 * joueurs ». Il n'y a pas de requête de plus à payer pour l'élargir.
 *
 * Un rendu sur dix cède son dernier rang à un candidat tiré hors fenêtre. C'est la seule
 * façon d'obtenir une observation sur ce que la sélection écarte : sans elle, le corpus ne
 * contient que ce que la règle de distance approuvait déjà, et ne peut donc pas servir à la
 * remettre en cause.
 *
 * La référence explorée entre dans le calcul du niveau de comparabilité comme les autres.
 * Elle n'en change presque jamais le verdict — la médiane de trois distances absorbe une
 * valeur extrême, c'est ce pour quoi elle a été choisie. La bannière sous-estime donc
 * légèrement le coût de la fente ; l'alternative, forcer `poor` comme pour un substitut, le
 * surestimerait bien davantage : un candidat lointain reste une comparaison légitime, là où
 * un substitut est une comparaison que les critères éliminatoires ont refusée.
 */
export async function resolveReferences(
  token: string,
  pool: CandidatePool,
  args: {
    myIlvl: number;
    myKillTimeMs: number;
    exclude: { code: string; fightID: number };
    mine: EligibilityProfile;
    /** Injecté pour que le tirage d'exploration soit testable. `Math.random` en production. */
    random?: () => number;
  }
): Promise<ResolvedReferences> {
  const { myIlvl, myKillTimeMs, exclude, mine, random = Math.random } = args;

  const filtered = pool.candidates.filter(
    (c) => !(c.report.code === exclude.code && c.report.fightID === exclude.fightID)
  );

  // Tout le vivier est scoré une fois : la fenêtre en tête, et le reste, d'où l'exploration
  // tire. Deux appels à `selectClosest` re-scoreraient les mêmes candidats pour rien.
  const ranked = selectClosest(filtered, myIlvl, myKillTimeMs, filtered.length);
  const closest = ranked.slice(0, VERIFICATION_WINDOW);
  const exploration = pickExploration(ranked.slice(VERIFICATION_WINDOW), random);

  // Promise.all preserves order, so both partitions stay sorted by distance and the
  // substitutes are drawn from the least-far eliminated candidate first.
  const verified = (
    await Promise.all([
      ...closest.map((s) => verifyCandidate(token, s, mine, false)),
      ...(exploration ? [verifyCandidate(token, exploration, mine, true)] : []),
    ])
  ).filter((v): v is VerifiedCandidate => v !== null);

  const window = verified.filter((v) => !v.explored);
  // Une exploration disqualifiée n'entre pas au panel : la fente sert à montrer un candidat
  // que la distance écarte, pas à contourner les critères éliminatoires.
  const explored = verified.find((v) => v.explored && v.disqualifiedBy.length === 0) ?? null;

  const qualified = window.filter((v) => v.disqualifiedBy.length === 0);
  const eliminated = window.filter((v) => v.disqualifiedBy.length > 0);

  // L'exploration prend le dernier rang, et le prend à la sélection : le panel garde sa
  // taille, il n'est pas élargi pour absorber le coût sans le montrer.
  const slots = explored ? TOP_N - 1 : TOP_N;
  const chosen = qualified.slice(0, slots);
  const substitutes = eliminated.slice(0, slots - chosen.length);
  const references = [...chosen, ...substitutes, ...(explored ? [explored] : [])];

  const topPlayers = await Promise.all(references.map((v) => buildTopPlayer(token, v)));

  const scored = references.map((v) => v.scored);
  const comparability: Comparability = {
    // A substituted panel is not comparable, whatever the distances say: the criterion
    // that eliminated the substitute is eliminatory, and the distance never saw it.
    level: substitutes.length > 0 ? 'poor' : comparabilityLevel(scored),
    referenceIlvl: medianOf(
      scored.map((s) => s.candidate.bracketData).filter((v): v is number => v !== undefined)
    ),
    myIlvl,
    referenceKillTimeMs: medianOf(scored.map((s) => s.candidate.duration)),
    myKillTimeMs,
    candidatesConsidered: filtered.length,
    pagesFetched: pool.pagesFetched,
    disqualified: eliminated.length,
    substituted: substitutes.length,
  };

  return { topPlayers, sample: sampleOf(verified), comparability };
}
