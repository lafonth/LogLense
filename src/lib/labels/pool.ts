import type { LabelReason } from './schema';
import type { DisqualificationReason } from '@/lib/wcl/eligibility';
import { ILVL_TOLERANCE, KILL_TIME_TOLERANCE } from '@/lib/wcl/constants';

/**
 * Le vivier de candidats d'une analyse, écarté comme retenu.
 *
 * Chaque analyse vérifie une douzaine de candidats — deux requêtes chacun — pour n'en
 * montrer que trois, et jette les autres. Ce qui se perd là n'est pas du calcul : c'est
 * **quel vivier existait à cette semaine du tier**. La trajectoire d'un joueur se rebâtit
 * depuis Warcraft Logs à tout moment ; l'état du classement en semaine 2 périme avec la
 * saison. D'où la règle de CLAUDE.md : repousser le calcul, jamais la capture.
 *
 * Un corpus qui ne contient que ce qui a passé le filtre apprend le filtre, pas la
 * comparabilité — les écartés sont les contre-exemples, donc la partie informative.
 *
 * Pointeurs seuls, comme les autres flux : `code`, `fightID`, `actorId`, plus nos propres
 * grandeurs calculées. Aucun nom, aucun texte libre, aucune charge WCL recopiée — les
 * mesures se réhydratent depuis l'API au moment de l'entraînement (§5d des CGU).
 */
export interface PoolCandidateRecord {
  v: 1;
  kind: 'pool';
  at: string;
  /** La semaine ISO du tier : la granularité utile est le palier de progression. */
  week: string;
  by: string | null;
  encounterId: number;
  difficulty: number;
  specId: number;
  /** Le combat analysé, sans son acteur : `by` identifie déjà le sujet. */
  subject: { code: string; fightID: number; ilvl: number; killTimeMs: number };
  candidate: {
    code: string;
    fightID: number;
    /** `null` quand le candidat n'a pas pu être vérifié : son acteur n'a jamais été résolu. */
    actorId: number | null;
    ilvl: number | null;
    killTimeMs: number;
    dps: number;
    tierPieces: number | null;
    externalUptime: number | null;
  };
  /** La distance de sélection. `null` quand elle n'était pas calculable, jamais `Infinity`. */
  distance: number | null;
  /** Écart d'ilvl du candidat au sujet, signé, en points d'ilvl. */
  ilvlGap: number | null;
  /** Écart de kill time du candidat au sujet, signé, en points de pourcentage du sujet. */
  killTimeGapPct: number | null;
  verified: boolean;
  disqualifiedBy: DisqualificationReason[];
  explored: boolean;
  shown: boolean;
  /** Montré alors que les critères éliminatoires l'avaient refusé — le panel manquait de monde. */
  substitute: boolean;
  /** Le motif d'écart, dans la liste fermée des rejets utilisateur. `null` si montré. */
  setAside: LabelReason | null;
}

/**
 * Ce que `references.ts` sait d'un candidat, avant mise en forme.
 *
 * La connaissance du vivier reste dans `references.ts` — corollaire de CLAUDE.md — mais la
 * forme du corpus reste ici, avec les autres schémas.
 */
export interface PoolObservation {
  code: string;
  fightID: number;
  actorId: number | null;
  ilvl: number | null;
  killTimeMs: number;
  dps: number;
  distance: number;
  verified: boolean;
  tierPieces: number | null;
  externalUptime: number | null;
  disqualifiedBy: DisqualificationReason[];
  explored: boolean;
  shown: boolean;
  substitute: boolean;
}

export function poolMonthKey(iso: string): string {
  return `labels:pool:${iso.slice(0, 7)}`;
}

/**
 * La semaine ISO-8601 d'un instant, en `YYYY-Www`.
 *
 * ISO et pas « n-ième lundi » : la semaine 1 est celle du premier jeudi, donc l'année de la
 * semaine n'est pas toujours celle de la date. Un reset de tier début janvier tomberait
 * sinon dans deux clés différentes selon le jour.
 */
export function tierWeek(iso: string): string {
  const date = new Date(iso);
  // Le jeudi de la semaine courante décide de l'année ISO.
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  thursday.setUTCDate(thursday.getUTCDate() - ((date.getUTCDay() + 6) % 7) + 3);

  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const firstThursday = new Date(jan4);
  firstThursday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + 3);

  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / 604_800_000);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Pourquoi ce candidat n'a pas été montré, dans le vocabulaire fermé des rejets utilisateur.
 *
 * Les deux critères éliminatoires se traduisent directement. Le reste a été écarté par la
 * **distance**, qui fusionne ilvl et kill time : le motif honnête est l'axe dominant des
 * deux, recalculé ici, et non un `other` qui perdrait l'information. Un candidat non
 * vérifiable, ou dont l'ilvl manque — donc dont la distance ne veut rien dire — reste
 * `other` : dire `ilvl` là serait inventer une mesure qu'on n'a pas.
 */
function setAsideReason(o: PoolObservation, ilvlGap: number | null): LabelReason | null {
  if (o.shown) return null;
  if (o.disqualifiedBy.includes('set-bonus')) return 'set-bonus';
  if (o.disqualifiedBy.includes('external')) return 'externals';
  if (!o.verified || ilvlGap === null || !Number.isFinite(o.distance)) return 'other';
  return o.distance === 0 ? 'other' : 'ilvl';
}

/**
 * Le vivier d'une analyse, une ligne par candidat, retenus et écartés à égalité.
 *
 * Aucune déduplication : elle demanderait une lecture avant écriture, donc un
 * read-modify-write, donc la perte silencieuse qu'un corpus append-only ne peut pas se
 * permettre. La redondance se nettoie à l'entraînement, où elle est bon marché.
 */
export function buildPoolRecords(
  observations: PoolObservation[],
  meta: {
    by: string | null;
    at: string;
    encounterId: number;
    difficulty: number;
    specId: number;
    subject: { code: string; fightID: number; ilvl: number; killTimeMs: number };
  }
): PoolCandidateRecord[] {
  const week = tierWeek(meta.at);
  const { ilvl: myIlvl, killTimeMs: myKillTimeMs } = meta.subject;

  return observations.map((o) => {
    const ilvlGap = o.ilvl === null ? null : o.ilvl - myIlvl;
    const killTimeGapPct =
      myKillTimeMs > 0 ? round1(((o.killTimeMs - myKillTimeMs) / myKillTimeMs) * 100) : null;

    // L'axe dominant de la distance, dans ses propres unités de tolérance : c'est ainsi que
    // `scoreCandidate` les combine, donc la seule comparaison qui ait un sens entre les deux.
    const normalizedIlvl = ilvlGap === null ? null : Math.abs(ilvlGap) / ILVL_TOLERANCE;
    const normalizedKillTime =
      killTimeGapPct === null ? null : Math.abs(killTimeGapPct) / 100 / KILL_TIME_TOLERANCE;
    const byKillTime =
      normalizedIlvl !== null && normalizedKillTime !== null && normalizedKillTime > normalizedIlvl;
    const axis = setAsideReason(o, ilvlGap);

    return {
      v: 1,
      kind: 'pool',
      at: meta.at,
      week,
      by: meta.by,
      encounterId: meta.encounterId,
      difficulty: meta.difficulty,
      specId: meta.specId,
      subject: meta.subject,
      candidate: {
        code: o.code,
        fightID: o.fightID,
        actorId: o.actorId,
        ilvl: o.ilvl,
        killTimeMs: o.killTimeMs,
        dps: o.dps,
        tierPieces: o.tierPieces,
        externalUptime: o.externalUptime,
      },
      distance: Number.isFinite(o.distance) ? o.distance : null,
      ilvlGap,
      killTimeGapPct,
      verified: o.verified,
      disqualifiedBy: o.disqualifiedBy,
      explored: o.explored,
      shown: o.shown,
      substitute: o.substitute,
      setAside: axis === 'ilvl' && byKillTime ? 'kill-time' : axis,
    } satisfies PoolCandidateRecord;
  });
}
