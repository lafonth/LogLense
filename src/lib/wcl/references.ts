import type { CombatantEvent } from './combatant';
import type { ScoredCandidate } from './comparability';
import type { DisqualificationReason, EligibilityProfile } from './eligibility';
import type { WCLTable } from './parsers';
import type { CachedVerification } from './reference-cache';
import type { PoolObservation } from '@/lib/labels/pool';
import type { Comparability, ReferenceSample, TopPlayer } from '@/types';
import { recordPool } from '@/lib/labels/record-pool';
import { gql } from './client';
import { findCombatantByName } from './combatant';
import { comparabilityLevel, medianOf, selectClosest } from './comparability';
import { CANDIDATE_PAGES, EXPLORATION_RATE, TOP_N, VERIFICATION_WINDOW } from './constants';
import { disqualify, eligibilityOf } from './eligibility';
import { fetchFightData } from './fight-data';
import { fmtMs, parseStats } from './parsers';
import { resolveSeasonPartitions } from './partitions';
import { poolCacheKey, readCachedPool, writeCachedPool } from './pool-cache';
import { Q_BUFFS, Q_WORLD_RANKINGS, Q_WORLD_RANKINGS_PARTITION } from './queries';
import {
  fightDataCacheKey,
  readCachedFightData,
  readCachedVerifications,
  verificationCacheKey,
  writeCachedFightData,
  writeCachedVerification,
} from './reference-cache';

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
  pagesExpected: number;
}

interface RankingsResponse {
  worldData: { encounter: { characterRankings: { rankings?: WorldRanking[] } } };
}

/**
 * Builds the candidate pool by fetching CANDIDATE_PAGES pages per partition of the
 * opening season of the tier, in parallel.
 *
 * WCL's default partition is the tier's own next season — on the current tier that means
 * five logs instead of several thousand, because a season that just opened has barely been
 * farmed. Querying the season's own partitions explicitly is what makes the pool populous.
 *
 * One page is 100 entries and the world rankings are ordered by damage, so the
 * players comparable to an under-geared character sit several pages deep — a
 * single page contains only the best-equipped. A page that fails is skipped
 * rather than failing the analysis, and pagesFetched reports what was obtained.
 *
 * Ces pages sont le gros de la facture Warcraft Logs d'une analyse, et elles ne dépendent
 * pas du joueur analysé : d'où le cache, à durée de vie explicite, partagé par tous les
 * joueurs d'une même spec sur un même boss. Voir `pool-cache.ts` pour le TTL et ce qu'il
 * garantit vis-à-vis des CGU.
 */
export async function fetchCandidatePool(
  token: string,
  args: { encounterId: number; difficulty: number; specName: string; className: string }
): Promise<CandidatePool> {
  const cacheKey = poolCacheKey(args);
  const cached = await readCachedPool(cacheKey);
  if (cached) return cached;

  // Résolu avant l'éclatement, pas dedans : les dix pages d'une partition partagent la même
  // liste, et la redemander par page paierait dix fois la même réponse.
  const partitions = await resolveSeasonPartitions(token, args.encounterId);

  const requests = partitions.length > 0 ? partitions : [null];

  const pages = await Promise.all(
    requests.flatMap((partition) =>
      Array.from({ length: CANDIDATE_PAGES }, (_, i) =>
        gql<RankingsResponse>(
          token,
          partition === null ? Q_WORLD_RANKINGS : Q_WORLD_RANKINGS_PARTITION,
          {
            encounterID: args.encounterId,
            difficulty: args.difficulty,
            specName: args.specName,
            className: args.className,
            page: i + 1,
            ...(partition === null ? {} : { partition }),
          }
        )
          .then((data) => data.worldData.encounter.characterRankings.rankings ?? [])
          .catch(() => null)
      )
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

  const pool = { candidates, pagesFetched, pagesExpected: requests.length * CANDIDATE_PAGES };

  // Attendue, pas mise en `void` : sur un runtime serverless une promesse non attendue part
  // avec la fonction, et le cache ne se remplirait jamais. L'appel n'échoue pas.
  await writeCachedPool(cacheKey, pool);

  return pool;
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
 *
 * Ces deux requêtes, fois treize candidats, sont l'autre gros de la facture d'une analyse —
 * et comme le vivier, elles ne dépendent pas du joueur analysé. `cached` porte ce que le
 * cache a déjà répondu pour ce candidat ; il est lu en amont, en une commande pour toute la
 * fenêtre, parce que treize allers-retours Redis rendraient au réseau ce qu'on vient
 * d'économiser chez Warcraft Logs.
 *
 * `disqualify` reste calculé ici, sur le chemin chaud, servi par le cache ou non : c'est la
 * seule partie du verdict qui compare au demandeur. La mettre en cache figerait le verdict
 * du premier arrivant pour tous les suivants.
 */
async function verifyCandidate(
  token: string,
  scored: ScoredCandidate<WorldRanking>,
  mine: EligibilityProfile,
  explored: boolean,
  cached: CachedVerification | null
): Promise<VerifiedCandidate | null> {
  const { candidate } = scored;
  const { code, fightID } = candidate.report;
  if (!code || !fightID) return null;

  if (cached) {
    const { combatant, profile } = cached;
    return { scored, combatant, profile, disqualifiedBy: disqualify(profile, mine), explored };
  }

  try {
    const combatant = await findCombatantByName(token, code, fightID, candidate.name);
    if (!combatant) return null;

    const data = await gql<{ reportData: { report: { buffs: WCLTable } } }>(token, Q_BUFFS, {
      code,
      fightIDs: [fightID],
      sourceID: combatant.sourceID,
    });

    const buffs = data.reportData.report.buffs;
    const profile = eligibilityOf(combatant, buffs, candidate.duration);

    // Attendue, pas mise en `void` : sur un runtime serverless, une promesse non attendue part
    // avec la fonction. `writeCachedVerification` ne jette pas et refuse les entrées trouées.
    await writeCachedVerification(verificationCacheKey({ code, fightID, name: candidate.name }), {
      combatant,
      profile,
      aurasRead: buffs.data?.auras?.length ?? 0,
    });

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

/** Le combat d'un candidat, la seule clé qui identifie une entrée du vivier de bout en bout. */
function fightKey(candidate: WorldRanking): string {
  return `${candidate.report.code}:${candidate.report.fightID}`;
}

/**
 * Le vivier tel qu'il a été jugé : une observation par candidat **tenté**, pas par candidat
 * retenu.
 *
 * C'est la seule fonction qui voie les trois populations à la fois — vérifiés, disqualifiés,
 * non vérifiables — et le seul endroit d'où elles sortent ensemble. Le panel n'en garde que
 * trois, `sample` que les vérifiés ; ce qui a été écarté avant l'affichage ne subsiste nulle
 * part ailleurs, et c'est précisément la partie qui périme avec la saison.
 */
function observationsOf(
  attempted: ScoredCandidate<WorldRanking>[],
  verified: VerifiedCandidate[],
  shown: Set<string>,
  substituted: Set<string>
): PoolObservation[] {
  const verifiedByFight = new Map(verified.map((v) => [fightKey(v.scored.candidate), v]));

  return attempted.map((scored) => {
    const { candidate, distance } = scored;
    const key = fightKey(candidate);
    const v = verifiedByFight.get(key);

    return {
      code: candidate.report.code,
      fightID: candidate.report.fightID,
      // Sans vérification l'acteur n'a jamais été résolu : `null`, et pas un identifiant
      // deviné à partir du nom, qui pointerait vers l'équipement d'un autre joueur.
      actorId: v?.combatant.sourceID ?? null,
      ilvl: candidate.bracketData ?? null,
      killTimeMs: candidate.duration,
      dps: Math.round(candidate.amount),
      distance,
      verified: v !== undefined,
      tierPieces: v?.profile.tierPieces ?? null,
      externalUptime: v?.profile.externalUptime ?? null,
      disqualifiedBy: v ? v.disqualifiedBy : [],
      explored: v?.explored ?? false,
      shown: shown.has(key),
      substitute: substituted.has(key),
    };
  });
}

/**
 * Les dégâts et la rotation d'une référence, mis en cache comme sa vérification.
 *
 * Trois requêtes par référence, fois `TOP_N` : le dernier tiers de la facture d'une analyse.
 * Elles ne dépendent pas non plus du demandeur — le combat d'un joueur classé ne bouge plus.
 *
 * Seuls les trois champs consommés sont écrits. `fetchFightData` en rend davantage — cibles,
 * dps, éligibilité, contexte de raid — mais aucun n'est lu sur ce chemin, et les recopier
 * gonflerait l'entrée sans rien servir.
 */
async function buildTopPlayer(token: string, verified: VerifiedCandidate): Promise<TopPlayer> {
  const { scored, combatant, profile, disqualifiedBy, explored } = verified;
  const { candidate, distance } = scored;
  const { code, fightID } = candidate.report;

  const dps = Math.round(candidate.amount);
  const cacheKey = fightDataCacheKey({ code, fightID, sourceID: combatant.sourceID });
  const cached = await readCachedFightData(cacheKey);

  const { stats, rotation, damageEntries } =
    cached ??
    (await fetchFightData(token, {
      code,
      fightId: fightID,
      combatant,
      name: candidate.name,
      fightMs: candidate.duration,
      dps,
    }));

  if (!cached) {
    await writeCachedFightData(cacheKey, { stats, rotation, damageEntries });
  }

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
    /** De quoi horodater et classer le vivier au corpus. Voir `recordPool`. */
    context: { encounterId: number; difficulty: number; specId: number };
    /** Injecté pour que le tirage d'exploration soit testable. `Math.random` en production. */
    random?: () => number;
  }
): Promise<ResolvedReferences> {
  const { myIlvl, myKillTimeMs, exclude, mine, context, random = Math.random } = args;

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
  const attemptedScored = [...closest, ...(exploration ? [exploration] : [])];
  const attempted = attemptedScored.length;

  // Toute la fenêtre en une commande, avant d'ouvrir la moindre requête chez WCL. Le tableau
  // rendu est aligné sur les clés, donc sur `attemptedScored` : c'est l'index qui apparie une
  // entrée à son candidat, jamais son contenu.
  const hits = await readCachedVerifications(
    attemptedScored.map((s) =>
      verificationCacheKey({
        code: s.candidate.report.code,
        fightID: s.candidate.report.fightID,
        name: s.candidate.name,
      })
    )
  );

  const verified = (
    await Promise.all(
      attemptedScored.map((s, i) =>
        verifyCandidate(token, s, mine, i >= closest.length, hits[i] ?? null)
      )
    )
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

  // Le vivier est capturé ici et pas dans les pipelines, ni dans la route : c'est le seul
  // point du code qui connaisse les écartés. Un pipeline ne reçoit que le panel et
  // l'échantillon — faire remonter les écartés jusqu'à la route les mettrait au passage dans
  // la réponse HTTP, donc les pointeurs de tiers dans le navigateur, pour rien.
  //
  // Attendue, pas mise en `void`, pour la raison de `writeCachedPool` : sur un runtime
  // serverless une promesse non attendue part avec la fonction. `recordPool` ne jette jamais.
  await recordPool(
    observationsOf(
      [...closest, ...(exploration ? [exploration] : [])],
      verified,
      new Set(references.map((v) => fightKey(v.scored.candidate))),
      new Set(substitutes.map((v) => fightKey(v.scored.candidate)))
    ),
    {
      ...context,
      subject: { ...exclude, ilvl: myIlvl, killTimeMs: myKillTimeMs },
    }
  );

  const scored = references.map((v) => v.scored);
  const referenceIlvls = scored
    .map((s) => s.candidate.bracketData)
    .filter((v): v is number => v !== undefined);
  const comparability: Comparability = {
    // A substituted panel is not comparable, whatever the distances say: the criterion
    // that eliminated the substitute is eliminatory, and the distance never saw it.
    level: substitutes.length > 0 ? 'poor' : comparabilityLevel(scored),
    referenceIlvl: medianOf(referenceIlvls),
    referenceIlvlCount: referenceIlvls.length,
    myIlvl,
    referenceKillTimeMs: medianOf(scored.map((s) => s.candidate.duration)),
    myKillTimeMs,
    candidatesConsidered: filtered.length,
    pagesFetched: pool.pagesFetched,
    disqualified: eliminated.length,
    unverifiable: attempted - verified.length,
    substituted: substitutes.length,
  };

  return { topPlayers, sample: sampleOf(verified), comparability };
}
