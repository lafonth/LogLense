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
  cooldowns: Record<string, CastEntry>;
  generators: Record<string, CastEntry>;
  finishers: Record<string, CastEntry>;
  uptime: Record<string, number>;
}

export interface DamageEntry {
  name: string;
  total: number;
}

export interface TopPlayer {
  stats: CharacterStats & { dps: number; killTime: string };
  rotation: RotationSummary;
}

export interface BossResult {
  encounter: string;
  encounterId: number;
  character: {
    stats: CharacterStats;
    rotation: RotationSummary;
    damageTable: { entries: DamageEntry[] };
    dps: number;
    bossDps: number | null;
    killTime: string;
    overallPct: number;
    overallPctOf: number | '?';
    todayPct: number;
    bossDpsPct: number | null;
    bracket: number;
  };
  topPlayers: TopPlayer[];
}

export interface AnalysisResult {
  input: AnalysisInput;
  bosses: (BossResult | null)[];
  generatedAt: string;
}
