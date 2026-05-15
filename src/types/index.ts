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
}

export interface CharacterStats {
  name: string;
  avgIlvl: number;
  agility: number;
  crit: number;
  haste: number;
  mastery: number;
  vers: number;
  talents: Record<number, number>;
}

export interface CastEntry {
  casts: number;
  perMin: number;
}

export interface RotationSummary {
  name: string;
  dps?: number;
  fightDurationMs: number;
  casts: Record<string, CastEntry>;
  buffs: Record<string, number>; // ability name → uptime %
}

export interface DamageEntry {
  name: string;
  total: number;
}

export interface TopPlayer {
  stats: CharacterStats & { dps: number; killTime: string };
  rotation: RotationSummary;
  damageTable: { entries: DamageEntry[] };
}

export interface FightTarget {
  name: string;
  type: string;
  damagePct: number;
}

export interface BossResult {
  encounter: string;
  encounterId: number;
  fightTargets: FightTarget[];
  character: {
    stats: CharacterStats;
    rotation: RotationSummary;
    damageTable: { entries: DamageEntry[] };
    dps: number;
    bossDps: number | null;
    killTime: string;
    overallPct: number | null;
    overallPctOf: number | '?' | null;
    todayPct: number | null;
    bossDpsPct: number | null;
    bracket: number | null;
  };
  topPlayers: TopPlayer[];
}

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
  bosses: (BossResult | null)[];
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
