import type { ToolSpec } from './provider';
import type { CohortFilter } from '@/lib/comparison/cohort';
import type { BossResult, ReferenceSample, TopPlayer } from '@/types';
import { describeCohort } from '@/lib/comparison/cohort';
import { compareCasts, compareUptimes } from '@/lib/comparison/rotation-stats';
import { fmtMs } from '@/lib/wcl/parsers';

/**
 * Ce que le chat a le droit de faire sur un instantané.
 *
 * Trois principes, tenus ici plutôt que dans la consigne du modèle — une consigne s'ignore,
 * un outil absent ne s'appelle pas :
 *
 * 1. **Lecture seule sur l'instantané, sauf une exception nommée.** Trois outils ne touchent
 *    à rien. Le quatrième, `promote_reference`, est le seul qui dépense, et il refuse tant
 *    que la dépense n'a pas été approuvée hors du modèle.
 * 2. **Le refus est un outil.** `decline_out_of_scope` n'est pas une politesse : c'est ce qui
 *    rend le refus observable et consignable sans transcription. Un modèle qui répond « je ne
 *    parle pas de survie » en prose ne laisse aucune trace exploitable ; le même refus passé
 *    par un outil se compte.
 * 3. **Vocabulaires fermés.** Noms d'outils, axes de resélection, sujets de refus : le corpus
 *    ne recevra que ces valeurs-là, jamais une chaîne venue du modèle.
 */

export const CHAT_TOOL_NAMES = [
  'reselect_cohort',
  'compare_reference',
  'promote_reference',
  'decline_out_of_scope',
] as const;
export type ChatToolName = (typeof CHAT_TOOL_NAMES)[number];

/** Les axes de filtrage, tels qu'ils entreront au corpus : un axe demandé, jamais sa valeur. */
export const COHORT_AXES = [
  'tier-pieces',
  'kill-time',
  'ilvl',
  'externals',
  'include-disqualified',
] as const;
export type CohortAxis = (typeof COHORT_AXES)[number];

/**
 * Ce sur quoi le produit refuse de se prononcer.
 *
 * Ce ne sont pas des trous à combler plus tard : aucune de ces données n'est récupérée, donc
 * tout ce qui s'en dirait serait inventé. `other` existe pour que le refus reste possible
 * hors de cette liste sans ouvrir un champ libre.
 */
export const OUT_OF_SCOPE_TOPICS = [
  'survival',
  'defensives',
  'damage-taken',
  'interrupts',
  'positioning',
  'boss-mechanics',
  'other',
] as const;
export type OutOfScopeTopic = (typeof OUT_OF_SCOPE_TOPICS)[number];

/** Ce qu'un appel d'outil laisse au corpus. Aucune valeur libre, aucun texte. */
export interface ChatToolLog {
  tool: ChatToolName;
  /** Les axes du filtre demandé, vides hors resélection. */
  axes: CohortAxis[];
  /** Le sujet refusé, `null` quand l'appel n'était pas un refus. */
  declined: OutOfScopeTopic | null;
  /** Vrai quand l'outil n'a pas agi : hors périmètre, dépense non approuvée, vivier périmé. */
  refused: boolean;
  /** Requêtes réellement parties chez Warcraft Logs. Zéro partout sauf sur une promotion. */
  wclCalls: number;
}

/** Les motifs de refus d'une promotion, ceux du garde comme ceux de la récupération. */
export type PromotionRefusal = 'expired' | 'failed' | 'quota' | 'unauthorized' | 'unavailable';

export type ChatPromotion =
  | { ok: true; player: TopPlayer; wclCalls: number }
  | { ok: false; reason: PromotionRefusal };

export interface ChatToolContext {
  boss: BossResult;
  /**
   * Les références promues pendant la conversation. Portée par l'appelant et mutée ici : une
   * promotion payée au tour trois doit rester comparable au tour cinq sans être repayée.
   */
  promoted: TopPlayer[];
  /**
   * Ce que l'appelant sait faire d'une promotion : garde de budget, jeton WCL, appel. `null`
   * quand la route ne l'offre pas — l'outil le dit alors, au lieu de faire semblant.
   */
  promote: ((sample: ReferenceSample) => Promise<ChatPromotion>) | null;
}

export interface ChatToolOutcome {
  /** Ce que le modèle relit. Du JSON compact : ce sont des tableaux, pas de la prose. */
  content: string;
  log: ChatToolLog;
}

/** Le coût annoncé d'une promotion, dans le message qui demande l'accord. */
const PROMOTION_ANNOUNCED_CALLS = 3;

export const CHAT_TOOLS: ToolSpec[] = [
  {
    name: 'reselect_cohort',
    description:
      'Replays the reference cohort on a subset of the verified candidate pool, and returns the recomputed stat, DPS and kill time distributions, the player position in each, and the comparability level of that cohort. Free: no requests. Use it as soon as the player asks "what if we only kept...". A filter that keeps nobody returns an empty cohort — say so, do not widen it on your own.',
    inputSchema: {
      type: 'object',
      properties: {
        tierPieces: {
          type: 'integer',
          description:
            'Keeps only candidates wearing exactly this many tier pieces. Candidates whose gear could not be read are dropped.',
        },
        minKillTimeSec: { type: 'number', description: 'Minimum fight duration, in seconds.' },
        maxKillTimeSec: { type: 'number', description: 'Maximum fight duration, in seconds.' },
        ilvlWithin: {
          type: 'number',
          description: 'Item level tolerance around the player, in points.',
        },
        maxExternalUptime: {
          type: 'number',
          description:
            'Cap on time spent under an offensive buff received from someone else, in points of uptime.',
        },
        includeDisqualified: {
          type: 'boolean',
          description:
            'Brings back candidates dropped by a disqualifying criterion. False by default.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'compare_reference',
    description:
      "Compares the player's rotation to one named reference whose damage and casts have already been fetched. Returns the casts-per-minute and uptime gaps, ordered by damage cost, plus that reference's damage breakdown. Free.",
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The reference name, as displayed.' },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'promote_reference',
    description:
      "Fetches damage and rotation for a candidate from the pool that has none — anything that is not already a complete reference. COSTS UP TO THREE WARCRAFT LOGS REQUESTS against the player's hourly quota. Announce the cost and get explicit agreement before calling with spendApproved true; without that agreement, the tool refuses.",
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The name of the pool candidate to promote.' },
        spendApproved: {
          type: 'boolean',
          description: 'True only after the player has explicitly agreed to the spend.',
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
  {
    name: 'decline_out_of_scope',
    description:
      'Declines an out-of-scope request. LogLense only fetches outgoing damage: survival, defensives, damage taken, interrupts, positioning and boss mechanics are not in the data, so nothing can be said about them without inventing it. Call this tool instead of answering from memory, then tell the player what is not measured.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          enum: [...OUT_OF_SCOPE_TOPICS],
          description: 'The topic asked about, in the closed vocabulary.',
        },
      },
      required: ['topic'],
      additionalProperties: false,
    },
  },
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function bool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

function round(value: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/**
 * Le filtre, lu champ par champ depuis ce que le modèle a produit.
 *
 * Un `as CohortFilter` sur une entrée d'outil ne vérifie rien — c'est du JSON généré, pas un
 * corps typé — et un `maxKillTimeSec` rendu en chaîne passerait droit dans une comparaison
 * numérique, où il retiendrait tout. Les axes retenus sortent du même passage : ils sont ce
 * que le corpus enregistrera, et ils ne peuvent donc pas être déduits ailleurs.
 *
 * Les secondes deviennent des millisecondes ici et nulle part ailleurs : le modèle raisonne
 * en secondes parce que c'est ce que l'écran affiche, `CohortFilter` compte en millisecondes
 * parce que c'est ce que `ReferenceSample` porte.
 */
export function readCohortFilter(input: unknown): { filter: CohortFilter; axes: CohortAxis[] } {
  const src = isRecord(input) ? input : {};
  const filter: CohortFilter = {};
  const axes: CohortAxis[] = [];

  const tier = num(src.tierPieces);
  if (tier !== undefined) {
    filter.tierPieces = Math.round(tier);
    axes.push('tier-pieces');
  }

  const min = num(src.minKillTimeSec);
  const max = num(src.maxKillTimeSec);
  if (min !== undefined) filter.minKillTimeMs = min * 1000;
  if (max !== undefined) filter.maxKillTimeMs = max * 1000;
  if (min !== undefined || max !== undefined) axes.push('kill-time');

  const ilvl = num(src.ilvlWithin);
  if (ilvl !== undefined) {
    filter.ilvlWithin = ilvl;
    axes.push('ilvl');
  }

  const externals = num(src.maxExternalUptime);
  if (externals !== undefined) {
    filter.maxExternalUptime = externals;
    axes.push('externals');
  }

  const disqualified = bool(src.includeDisqualified);
  if (disqualified !== undefined) {
    filter.includeDisqualified = disqualified;
    // Seul le vrai est un axe : `includeDisqualified: false` est le défaut, et l'enregistrer
    // ferait lire au corpus une demande là où il n'y a qu'un champ recopié.
    if (disqualified) axes.push('include-disqualified');
  }

  return { filter, axes };
}

function readTopic(input: unknown): OutOfScopeTopic {
  const topic = isRecord(input) ? input.topic : null;
  return (OUT_OF_SCOPE_TOPICS as readonly unknown[]).includes(topic)
    ? (topic as OutOfScopeTopic)
    : 'other';
}

function readName(input: unknown): string {
  const name = isRecord(input) ? input.name : null;
  return typeof name === 'string' ? name : '';
}

/** Casse et espaces ignorés : le modèle recopie un nom affiché, pas une clé. */
function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * La durée de combat du sujet, relue de ce que l'écran affiche.
 *
 * `BossResult` ne porte pas les millisecondes du sujet — `killTime` est déjà formaté par
 * `fmtMs`, et le seul autre porteur, `context`, peut être `null`. Relire la chaîne coûte une
 * seconde de précision au pire ; la distance de comparabilité se joue sur des dizaines de
 * secondes, l'arrondi n'y déplace rien.
 */
export function subjectKillTimeMs(boss: BossResult): number {
  const [minutes, seconds] = boss.character.killTime.split(':');
  const ms = (Number(minutes) * 60 + Number(seconds)) * 1000;
  return Number.isFinite(ms) ? ms : 0;
}

function referencesOf(context: ChatToolContext): TopPlayer[] {
  return [...context.boss.topPlayers, ...context.promoted];
}

function hasRotation(context: ChatToolContext, name: string): boolean {
  return referencesOf(context).some((p) => sameName(p.provenance.name, name));
}

function runReselect(context: ChatToolContext, input: unknown): ChatToolOutcome {
  const { filter, axes } = readCohortFilter(input);
  const boss = context.boss;
  const view = describeCohort(
    {
      stats: boss.character.stats,
      dps: boss.character.dps,
      killTimeMs: subjectKillTimeMs(boss),
    },
    boss.sample,
    filter
  );

  const content = JSON.stringify({
    size: view.size,
    excludedByFilter: view.excluded,
    comparability: view.level,
    medianDistance: view.medianDistance === null ? null : round(view.medianDistance, 2),
    stats: view.stats.map((s) => ({
      axis: s.label,
      mine: round(s.mine),
      min: round(s.min),
      median: round(s.median),
      max: round(s.max),
      myPercentile: s.percentile,
    })),
    dps: view.dps && {
      mine: Math.round(view.dps.mine),
      min: Math.round(view.dps.min),
      median: Math.round(view.dps.median),
      max: Math.round(view.dps.max),
      myPercentile: view.dps.percentile,
    },
    killTime: view.killTimeMs && {
      mine: fmtMs(view.killTimeMs.mine),
      min: fmtMs(view.killTimeMs.min),
      median: fmtMs(view.killTimeMs.median),
      max: fmtMs(view.killTimeMs.max),
    },
    members: view.members.map((m) => ({
      name: m.name,
      dps: Math.round(m.dps),
      killTime: fmtMs(m.killTimeMs),
      avgIlvl: round(m.avgIlvl),
      tierPieces: m.tierPieces,
      externalUptime: round(m.externalUptime),
      qualified: m.qualified,
      distance: round(m.distance, 2),
      // Sans ce drapeau, le modèle appellerait `compare_reference` sur un membre sans
      // rotation pour découvrir qu'il n'en a pas — un aller-retour pour une information que
      // la liste connaît déjà.
      hasRotation: hasRotation(context, m.name),
    })),
  });

  return {
    content,
    log: { tool: 'reselect_cohort', axes, declined: null, refused: false, wclCalls: 0 },
  };
}

function runCompare(context: ChatToolContext, input: unknown): ChatToolOutcome {
  const name = readName(input);
  const player = referencesOf(context).find((p) => sameName(p.provenance.name, name));
  const log: ChatToolLog = {
    tool: 'compare_reference',
    axes: [],
    declined: null,
    refused: player === undefined,
    wclCalls: 0,
  };

  if (!player) {
    return {
      content: JSON.stringify({
        error: 'no-rotation',
        message:
          'This reference has no rotation fetched. Use promote_reference to get it — that costs requests — or compare against one of the complete references.',
        complete: referencesOf(context).map((p) => p.provenance.name),
      }),
      log,
    };
  }

  const boss = context.boss;
  // Une seule référence dans le tableau : la médiane d'un singleton est sa valeur, donc
  // `referenceMedian` est ici « ce que cette référence a fait », pas une agrégation.
  const casts = compareCasts(boss.character.rotation, [player], boss.character.damageTable.entries);
  const uptimes = compareUptimes(boss.character.rotation, [player]);

  const content = JSON.stringify({
    reference: {
      name: player.provenance.name,
      dps: Math.round(player.provenance.dps),
      killTime: player.stats.killTime,
      avgIlvl: player.provenance.ilvl === null ? null : round(player.provenance.ilvl),
      tierPieces: player.provenance.tierPieces,
      externalUptime: round(player.provenance.externalUptime),
      disqualifiedBy: player.provenance.disqualifiedBy,
    },
    casts: casts.map((c) => ({
      name: c.name,
      minePerMin: round(c.mine, 2),
      theirsPerMin: c.referenceMedian === null ? null : round(c.referenceMedian, 2),
      deviationPct: c.deviationPct,
      damageShare: c.damageShare === null ? null : round(c.damageShare, 3),
    })),
    uptimes: uptimes.map((u) => ({
      name: u.name,
      minePct: round(u.mine),
      theirsPct: u.referenceMedian === null ? null : round(u.referenceMedian),
      deviationPct: u.deviationPct,
    })),
    theirDamage: player.damageTable.entries.map((e) => ({ name: e.name, total: e.total })),
  });

  return { content, log };
}

function refusalMessage(reason: PromotionRefusal): string {
  switch (reason) {
    case 'expired':
      return 'The analysis is more than twenty-four hours old: what was verified on this candidate no longer exists. Ask the player to re-run the analysis.';
    case 'quota':
      return 'The player hourly Warcraft Logs quota is reached. Nothing was spent; offer to try again later.';
    case 'unauthorized':
      return 'The player must be signed in to spend requests.';
    case 'unavailable':
      return 'Warcraft Logs is momentarily unavailable.';
    case 'failed':
      return 'The fetch failed. Do not retry: rely on the references that are already complete.';
  }
}

async function runPromote(context: ChatToolContext, input: unknown): Promise<ChatToolOutcome> {
  const name = readName(input);
  const approved = bool(isRecord(input) ? input.spendApproved : null) ?? false;
  const log: ChatToolLog = {
    tool: 'promote_reference',
    axes: [],
    declined: null,
    refused: true,
    wclCalls: 0,
  };

  if (hasRotation(context, name)) {
    return {
      content: JSON.stringify({
        error: 'already-complete',
        message:
          'This reference already has its rotation. Call compare_reference: there is nothing to spend.',
      }),
      log,
    };
  }

  const sample = context.boss.sample.find((s) => sameName(s.name, name));
  if (!sample) {
    return {
      content: JSON.stringify({
        error: 'unknown-candidate',
        message: 'That name is not in the verified candidate pool.',
        candidates: context.boss.sample.map((s) => s.name),
      }),
      log,
    };
  }

  // La dépense ne repose pas sur la seule parole du modèle : sans drapeau, l'outil refuse et
  // rend le coût, ce qui force la question au joueur avant la première requête. C'est la
  // phrase du plan — « annoncer qu'une demande coûte des requêtes, pas les dépenser en
  // silence » — écrite là où elle est vérifiable.
  if (!approved) {
    return {
      content: JSON.stringify({
        error: 'spend-not-approved',
        wclCalls: PROMOTION_ANNOUNCED_CALLS,
        message:
          "Fetching damage and rotation for this candidate costs up to three Warcraft Logs requests against the player's hourly quota. Announce it, ask for their agreement, then call this tool again with spendApproved true.",
      }),
      log,
    };
  }

  if (!context.promote) {
    return {
      content: JSON.stringify({
        error: 'unavailable',
        message: 'Promotion is not available on this conversation.',
      }),
      log,
    };
  }

  const outcome = await context.promote(sample);
  if (!outcome.ok) {
    return {
      content: JSON.stringify({ error: outcome.reason, message: refusalMessage(outcome.reason) }),
      log,
    };
  }

  context.promoted.push(outcome.player);
  log.refused = false;
  log.wclCalls = outcome.wclCalls;

  return {
    content: JSON.stringify({
      promoted: outcome.player.provenance.name,
      wclCalls: outcome.wclCalls,
      message: 'Damage and rotation fetched. Call compare_reference on that name.',
    }),
    log,
  };
}

function runDecline(input: unknown): ChatToolOutcome {
  const topic = readTopic(input);
  return {
    content: JSON.stringify({
      declined: topic,
      message:
        'LogLense only fetches outgoing damage. Nothing was measured on this topic, so nothing will be said about it — this is not a temporary limit, it is the scope. Tell the player, and offer what is measured: rotation, damage, stats, talents, reference cohort.',
    }),
    log: { tool: 'decline_out_of_scope', axes: [], declined: topic, refused: true, wclCalls: 0 },
  };
}

/**
 * Exécute un appel d'outil, ou rend `null` sur un nom inconnu.
 *
 * Ne jette jamais : la boucle est déjà en train de streamer une réponse quand l'outil part,
 * et une exception y couperait le corps SSE en cours. Un nom inconnu est rendu à l'appelant,
 * qui le repasse au modèle comme une erreur d'outil — de quoi se reprendre au tour suivant.
 */
export async function runChatTool(
  context: ChatToolContext,
  call: { name: string; input: unknown }
): Promise<ChatToolOutcome | null> {
  switch (call.name) {
    case 'reselect_cohort':
      return runReselect(context, call.input);
    case 'compare_reference':
      return runCompare(context, call.input);
    case 'promote_reference':
      return runPromote(context, call.input);
    case 'decline_out_of_scope':
      return runDecline(call.input);
    default:
      return null;
  }
}
