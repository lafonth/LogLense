import type { ComparabilityLevel } from '@/lib/wcl/comparability';
import type { DisqualificationReason, EligibilityProfile } from '@/lib/wcl/eligibility';
import type { FightContext } from '@/lib/wcl/fight-context';
import type { IconIndex } from '@/lib/wcl/icons';
import type { TrajectoryPoint } from '@/lib/wcl/trajectory';

/**
 * D'où sort `character.dps`.
 *
 * Déclaré ici et non dans `labels/exposure`, qui le ré-exporte : la provenance est une
 * propriété du résultat d'analyse, et la capture ne fait que la recopier. Un enregistrement
 * dont la provenance serait affirmée par la route plutôt que par le pipeline se contredirait
 * dès que le pipeline change d'avis.
 */
export type SubjectDpsSource = 'ranking' | 'damage-table';

export interface WowCharacter {
  id: number;
  name: string;
  realmName: string;
  realmSlug: string;
  class: string;
  level: number;
}

export interface StoredCharacter {
  name: string;
  realmName: string;
  realmSlug: string;
  region: string;
  class: string;
}

export interface Encounter {
  id: number;
  name: string;
}

export interface Zone {
  id: number;
  name: string;
  encounters: Encounter[];
}

export interface AnalysisInput {
  characterName: string;
  serverSlug: string;
  region: 'US' | 'EU' | 'KR' | 'TW' | 'CN';
  difficulty: 3 | 4 | 5;
  encounters: Encounter[];
  specId: number;
}

export interface CharacterStats {
  name: string;
  avgIlvl: number;
  primaryStat: number;
  crit: number;
  haste: number;
  mastery: number;
  vers: number;
  talents: Record<number, number>;
}

export interface CastEntry {
  /**
   * L'id de sort WCL, conservé pour rattacher un cast à sa ligne de dégâts. Le nom seul ne
   * suffit pas : deux tables différentes, deux libellés possibles pour le même sort.
   */
  guid: number;
  casts: number;
  perMin: number;
}

/**
 * Un sort de l'ouverture, à sa place dans la séquence.
 *
 * `offsetMs` compte depuis le premier cast du combat, pas depuis le pull : ce qui se
 * compare, c'est l'espacement des sorts entre eux, pas le temps de réaction au décompte.
 */
export interface OpeningCast {
  guid: number;
  name: string;
  offsetMs: number;
}

export interface RotationSummary {
  name: string;
  dps?: number;
  fightDurationMs: number;
  casts: Record<string, CastEntry>;
  buffs: Record<string, number>; // ability name → uptime %
  /**
   * Les premiers sorts, dans l'ordre. Vide quand le log ne porte aucun événement de cast
   * exploitable — l'écran doit alors dire qu'il ne sait pas, pas afficher une ouverture vide.
   */
  opening: OpeningCast[];
  /**
   * Nom de capacité → icône, pour tout ce que ce combat a rendu : casts, auras et lignes de
   * dégâts. Facultatif, et il doit le rester : un instantané écrit avant que le parse ne
   * garde `abilityIcon` est relu tel quel pendant 24 h. L'écran retombe alors sur sa
   * pastille neutre — jamais sur une image cassée.
   */
  icons?: IconIndex;
}

export interface DamageEntry {
  /** Le pendant de {@link CastEntry.guid} : c'est par lui que les deux tables se joignent. */
  guid: number;
  name: string;
  total: number;
}

/**
 * D'où vient une référence et ce que la sélection a vu d'elle.
 *
 * `ilvl` est le `bracketData` du classement — l'ilvl sur lequel la distance a été
 * calculée — et non `stats.avgIlvl`, qui est recalculé depuis l'équipement. Le corpus
 * doit pouvoir redériver l'écart consigné à partir des entrées consignées.
 */
export interface ReferenceProvenance {
  code: string;
  fightID: number;
  /**
   * Le pointeur de réhydratation : `code` + `fightID` + `actorId` désignent la référence
   * sans son nom. C'est ce qui dispense le corpus de conserver le nom d'un tiers.
   */
  actorId: number;
  name: string;
  ilvl: number | null;
  killTimeMs: number;
  dps: number;
  distance: number;
  /**
   * Vide quand la référence a passé les critères éliminatoires. Non vide quand elle a été
   * retenue quand même, faute de candidats qualifiés : c'est une substitution, et l'écran
   * doit le dire plutôt que la présenter comme les autres.
   */
  disqualifiedBy: DisqualificationReason[];
  /** Pièces du plus grand set de tier portées ; `null` quand le log ne le dit pas. */
  tierPieces: number | null;
  /** Uptime cumulée des externals offensifs reçus, en points de durée du combat. */
  externalUptime: number;
  /**
   * Vraie quand la référence vient de la fente d'exploration, hors de ce que la sélection
   * aurait retenu. À l'entraînement, elle sépare « montrée parce que la règle l'a choisie »
   * de « montrée pour voir » : confondre les deux ferait passer le biais du sélecteur pour
   * du signal.
   */
  explored: boolean;
}

export interface TopPlayer {
  stats: CharacterStats & { dps: number; killTime: string };
  rotation: RotationSummary;
  damageTable: { entries: DamageEntry[] };
  /**
   * Où sont partis ses dégâts, cible par cible.
   *
   * Le sujet porte la même liste sur `BossResult`. Les deux ensemble font la seule lecture
   * qui vaille : « 4 % sur les adds » ne dit rien tant qu'on ignore ce que la cohorte y met.
   */
  fightTargets: FightTarget[];
  provenance: ReferenceProvenance;
}

/**
 * Un candidat de la fenêtre de vérification, retenu comme référence ou non.
 *
 * Stats et talents sortent du `CombatantInfo` déjà récupéré pour juger le candidat :
 * élargir l'échantillon *statistique* à toute la fenêtre ne coûte aucune requête. Dégâts
 * et rotation, eux, en coûtent — ils restent limités aux `TOP_N` de `topPlayers`, et
 * l'écran comme le prompt doivent dire lequel des deux ils montrent.
 */
export interface ReferenceSample {
  name: string;
  code: string;
  fightID: number;
  /** Même pointeur de réhydratation que sur {@link ReferenceProvenance}. */
  actorId: number;
  stats: CharacterStats;
  dps: number;
  killTimeMs: number;
  /** Faux quand un critère éliminatoire l'a écarté : la distribution doit pouvoir l'exclure. */
  qualified: boolean;
  /**
   * Pièces du set de tier, `null` quand l'équipement est absent — jamais zéro par défaut.
   *
   * Recopié de l'`EligibilityProfile` déjà payé pour juger le candidat, comme sur
   * {@link ReferenceProvenance}. C'est ce qui rend une resélection « seulement le 4p »
   * jouable sur l'instantané, sans une requête de plus.
   */
  tierPieces: number | null;
  /** Points de durée de combat sous buff offensif reçu. Même source, même raison. */
  externalUptime: number;
  /** Même marque que sur {@link ReferenceProvenance} : tirée hors fenêtre, pas sélectionnée. */
  explored: boolean;
}

export interface FightTarget {
  name: string;
  type: string;
  damagePct: number;
}

export type { ComparabilityLevel } from '@/lib/wcl/comparability';

export interface Comparability {
  level: ComparabilityLevel;
  /** Median of the chosen references; null when there are none. */
  referenceIlvl: number | null;
  /**
   * Combien de références portaient un ilvl. Une médiane sur une seule se lisait comme une
   * médiane sur trois : l'effectif est ce qui dit si le chiffre engage le panel entier.
   */
  referenceIlvlCount: number;
  myIlvl: number;
  referenceKillTimeMs: number | null;
  myKillTimeMs: number;
  candidatesConsidered: number;
  pagesFetched: number;
  /**
   * Le vivier tel qu'il est avant sélection : le DPS médian et l'ilvl médian de tous les
   * candidats retenus de la fenêtre de classement. C'est la comparaison naïve — celle que
   * rend n'importe quel classement — et le seul chiffre qui permette de dire ce que la
   * comparabilité a retiré de l'écart annoncé au joueur.
   *
   * `null` quand le vivier est vide, ou quand aucun candidat ne portait d'ilvl.
   * `poolDps` s'appuie sur `candidatesConsidered`, `poolIlvl` sur `poolIlvlCount`.
   */
  poolDps: number | null;
  poolIlvl: number | null;
  poolIlvlCount: number;
  /** Candidats de la fenêtre écartés par un critère éliminatoire. */
  disqualified: number;
  /**
   * Candidats que la vérification n'a pas pu juger : rapport privé, combattant introuvable,
   * requête refusée. Ils disparaissaient sans trace, ce qui rendait un panel réduit par un
   * incident de collecte indiscernable d'un panel réduit par les critères.
   */
  unverifiable: number;
  /**
   * Références retenues bien qu'écartées, pour compléter le panel. Toute valeur non nulle
   * force `level` à `poor` : le panel est plein, mais il ne dit plus la même chose.
   */
  substituted: number;
}

/**
 * Ce qui désigne une analyse, et donc son instantané : exactement les champs qui entrent dans
 * la clé Redis, un variant par pipeline.
 *
 * Frappé sur le `BossResult` par la route qui l'a produit, parce que le rendu ne suffit pas à
 * le reconstituer. Un combat forcé et un meilleur parse qui tombe sur ce même combat donnent
 * deux résultats identiques et deux clés différentes — la variante demandée n'est nulle part
 * dans ce qu'on affiche. Le chat en a besoin pour relire l'instantané, et il ne peut pas la
 * deviner.
 *
 * C'est une **désignation**, jamais une clé : le client la renvoie telle quelle, le serveur
 * la revalide et reforme la clé lui-même. Accepter une clé toute faite laisserait lire
 * n'importe quelle entrée du cache, celle d'un autre joueur comprise.
 */
export interface CharacterSnapshotRef {
  kind: 'character';
  region: string;
  serverSlug: string;
  characterName: string;
  encounterId: number;
  difficulty: number;
  specId: number;
  specIdOverride?: number;
  fightOverride?: { code: string; fightID: number };
}

export interface ReportSnapshotRef {
  kind: 'report';
  code: string;
  actorId: number;
  encounterId: number;
  fightId: number;
  difficulty: number;
}

export type SnapshotRef = CharacterSnapshotRef | ReportSnapshotRef;

export interface BossResult {
  /**
   * Identifie ce rendu-ci. Les verdicts « pas comparable » le reprennent : sans lui, un
   * refus ne peut être ni rattaché à ce qui a été montré, ni dédupliqué. Une ré-analyse du
   * même combat en produit un nouveau — c'est une nouvelle exposition, pas un doublon.
   */
  renderId: string;
  /**
   * De quoi relire l'instantané de ce rendu. Absent quand l'analyse n'a pas été instantanée —
   * un résultat incomplet ne s'écrit pas — et le chat est alors indisponible pour ce boss.
   */
  snapshot?: SnapshotRef;
  encounter: string;
  encounterId: number;
  specId: number;
  difficulty: number;
  fightTargets: FightTarget[];
  character: {
    stats: CharacterStats;
    rotation: RotationSummary;
    damageTable: { entries: DamageEntry[] };
    dps: number;
    /**
     * Ce que `dps` mesure. Les références portent toujours le montant des classements WCL
     * (`references.ts`), et l'écart affiché est une soustraction entre les deux : une
     * provenance différente de `ranking` dit que cette soustraction porte sur deux mesures
     * qui ne se recouvrent pas exactement.
     */
    dpsSource: SubjectDpsSource;
    bossDps: number | null;
    killTime: string;
    overallPct: number | null;
    overallPctOf: number | '?' | null;
    todayPct: number | null;
    bossDpsPct: number | null;
    bracket: number | null;
    /** Le combat analysé, pour que l'écran puisse nommer ce qu'il étiquette. */
    source: { code: string; fightID: number; actorId: number };
    /**
     * Tous les kills classés du joueur sur cette rencontre, du plus ancien au plus récent,
     * le combat analysé marqué. Vide quand la source n'a pas pu être lue — un rapport isolé
     * reste un rapport valide.
     */
    trajectory: TrajectoryPoint[];
    /**
     * Ce à quoi les références ont été confrontées. Une décision « pas comparable » sur le
     * set bonus ne veut rien dire sans le palier des deux côtés : le corpus doit porter
     * celui du sujet, pas seulement celui de la référence.
     */
    eligibility: EligibilityProfile;
    /**
     * Ce qui est arrivé au raid pendant la pull : morts, wipes. `null` quand le rapport ne
     * l'a pas rendu — le contexte enrichit l'analyse, il ne la conditionne pas.
     */
    context: FightContext | null;
  };
  /** Les `TOP_N` références dont dégâts et rotation ont été récupérés. */
  topPlayers: TopPlayer[];
  /**
   * Toute la fenêtre vérifiée, `topPlayers` compris. C'est l'échantillon sur lequel se
   * lisent stats et talents : la question est « où je me situe », pas « qui copier ».
   */
  sample: ReferenceSample[];
  comparability: Comparability;
}

/**
 * Un refus nommé, rendu à la place d'un `BossResult` par les deux pipelines à références.
 *
 * C'est une **valeur**, pas une exception. `runAnalysis` et la route rapport enveloppent
 * chaque boss dans `.catch(() => null)` : un refus qui jette redevient `null` avant l'écran,
 * et l'écran ne sait plus dire que « pas de données ». C'est exactement ce silence qui a
 * laissé comparer une Prêtre Sacré à des Prêtres Ombre et rendre un rapport cohérent et faux.
 */
export interface BossRefusal {
  /** Le discriminant de l'union. Une seule cause aujourd'hui ; d'autres viendront s'y ranger. */
  refused: 'unsupported-spec';
  encounter: string;
  encounterId: number;
  /** La spec lue dans le log, jamais celle du formulaire : c'est le log qui gagne. */
  specId: number;
  /** « Holy Priest », ou `null` quand la table ne connaît pas cet id. */
  specLabel: string | null;
}

/** Ce qu'une analyse de boss peut rendre : un résultat, ou un refus qui se dit. */
export type BossOutcome = BossResult | BossRefusal;

export interface ReportFight {
  id: number;
  name: string;
  encounterID: number;
  kill: boolean;
  startTime: number;
  endTime: number;
  difficulty: number;
}

export interface ReportActor {
  id: number;
  name: string;
  type: string;
  subType: string;
  server: string | null;
}

export interface ReportMeta {
  title: string;
  fights: ReportFight[];
  actors: ReportActor[];
}

export interface AnalysisResult {
  input: AnalysisInput;
  bosses: (BossOutcome | null)[];
  generatedAt: string;
}

export interface TalentNode {
  id: number;
  talentIds: number[];
  name: string;
  names: string[];
  spellId: number;
  row: number;
  col: number;
  maxRanks: number;
  nodeType: 'single' | 'choice' | 'rankable';
  treeType: 'class' | 'spec';
  children: number[];
}
