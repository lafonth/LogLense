export type PrimaryStat = 'agility' | 'strength' | 'intellect';

/** DPS, soin ou tank. LogLense n'analyse que les dégâts : le rôle dit pourquoi il refuse. */
export type SpecRole = 'dps' | 'healer' | 'tank';

export interface SpecInfo {
  specId: number;
  specName: string;
  className: string;
  wowClass: string;
  primaryStat: PrimaryStat;
  role: SpecRole;
  /**
   * Vrai si LogLense sait analyser cette spec. Une spec connue mais non supportée existe pour
   * être **nommée** : tant que `getSpecInfo(257)` rendait `null`, le pipeline retombait sur la
   * spec du formulaire et comparait une Prêtre Sacré à des Prêtres Ombre.
   */
  supported: boolean;
}

/** Une entrée de table avant dérivation du rôle et du drapeau de support. */
type SpecSeed = Omit<SpecInfo, 'role' | 'supported'>;

const DPS_SPECS: SpecSeed[] = [
  // Warrior — strength
  {
    specId: 71,
    specName: 'Arms',
    className: 'Warrior',
    wowClass: 'Warrior',
    primaryStat: 'strength',
  },
  {
    specId: 72,
    specName: 'Fury',
    className: 'Warrior',
    wowClass: 'Warrior',
    primaryStat: 'strength',
  },
  // Paladin — strength
  {
    specId: 70,
    specName: 'Retribution',
    className: 'Paladin',
    wowClass: 'Paladin',
    primaryStat: 'strength',
  },
  // Hunter — agility
  {
    specId: 253,
    specName: 'BeastMastery',
    className: 'Hunter',
    wowClass: 'Hunter',
    primaryStat: 'agility',
  },
  {
    specId: 254,
    specName: 'Marksmanship',
    className: 'Hunter',
    wowClass: 'Hunter',
    primaryStat: 'agility',
  },
  {
    specId: 255,
    specName: 'Survival',
    className: 'Hunter',
    wowClass: 'Hunter',
    primaryStat: 'agility',
  },
  // Rogue — agility
  {
    specId: 259,
    specName: 'Assassination',
    className: 'Rogue',
    wowClass: 'Rogue',
    primaryStat: 'agility',
  },
  {
    specId: 260,
    specName: 'Outlaw',
    className: 'Rogue',
    wowClass: 'Rogue',
    primaryStat: 'agility',
  },
  {
    specId: 261,
    specName: 'Subtlety',
    className: 'Rogue',
    wowClass: 'Rogue',
    primaryStat: 'agility',
  },
  // Priest — intellect
  {
    specId: 258,
    specName: 'Shadow',
    className: 'Priest',
    wowClass: 'Priest',
    primaryStat: 'intellect',
  },
  // Death Knight — strength
  {
    specId: 251,
    specName: 'Frost',
    className: 'DeathKnight',
    wowClass: 'Death Knight',
    primaryStat: 'strength',
  },
  {
    specId: 252,
    specName: 'Unholy',
    className: 'DeathKnight',
    wowClass: 'Death Knight',
    primaryStat: 'strength',
  },
  // Shaman — intellect / agility
  {
    specId: 262,
    specName: 'Elemental',
    className: 'Shaman',
    wowClass: 'Shaman',
    primaryStat: 'intellect',
  },
  {
    specId: 263,
    specName: 'Enhancement',
    className: 'Shaman',
    wowClass: 'Shaman',
    primaryStat: 'agility',
  },
  // Mage — intellect
  { specId: 62, specName: 'Arcane', className: 'Mage', wowClass: 'Mage', primaryStat: 'intellect' },
  { specId: 63, specName: 'Fire', className: 'Mage', wowClass: 'Mage', primaryStat: 'intellect' },
  { specId: 64, specName: 'Frost', className: 'Mage', wowClass: 'Mage', primaryStat: 'intellect' },
  // Warlock — intellect
  {
    specId: 265,
    specName: 'Affliction',
    className: 'Warlock',
    wowClass: 'Warlock',
    primaryStat: 'intellect',
  },
  {
    specId: 266,
    specName: 'Demonology',
    className: 'Warlock',
    wowClass: 'Warlock',
    primaryStat: 'intellect',
  },
  {
    specId: 267,
    specName: 'Destruction',
    className: 'Warlock',
    wowClass: 'Warlock',
    primaryStat: 'intellect',
  },
  // Monk — agility
  {
    specId: 269,
    specName: 'Windwalker',
    className: 'Monk',
    wowClass: 'Monk',
    primaryStat: 'agility',
  },
  // Druid — agility / intellect
  {
    specId: 102,
    specName: 'Balance',
    className: 'Druid',
    wowClass: 'Druid',
    primaryStat: 'intellect',
  },
  { specId: 103, specName: 'Feral', className: 'Druid', wowClass: 'Druid', primaryStat: 'agility' },
  // Demon Hunter — agility
  {
    specId: 577,
    specName: 'Havoc',
    className: 'DemonHunter',
    wowClass: 'Demon Hunter',
    primaryStat: 'agility',
  },
  // Evoker — intellect
  {
    specId: 1467,
    specName: 'Devastation',
    className: 'Evoker',
    wowClass: 'Evoker',
    primaryStat: 'intellect',
  },
];

/**
 * Soin et tank : connus, jamais analysés. Ils n'entrent dans aucune sélection ni dans aucun
 * sélecteur — leur seule raison d'être est qu'un refus puisse nommer la spec au lieu de rendre
 * `null`. La stat principale est renseignée parce qu'elle existe pour toute spec de WoW, pas
 * parce qu'on s'en sert ici.
 */
const OFF_ROLE_SPECS: Array<SpecSeed & { role: 'healer' | 'tank' }> = [
  // Warrior
  {
    specId: 73,
    specName: 'Protection',
    className: 'Warrior',
    wowClass: 'Warrior',
    primaryStat: 'strength',
    role: 'tank',
  },
  // Paladin
  {
    specId: 65,
    specName: 'Holy',
    className: 'Paladin',
    wowClass: 'Paladin',
    primaryStat: 'intellect',
    role: 'healer',
  },
  {
    specId: 66,
    specName: 'Protection',
    className: 'Paladin',
    wowClass: 'Paladin',
    primaryStat: 'strength',
    role: 'tank',
  },
  // Priest
  {
    specId: 256,
    specName: 'Discipline',
    className: 'Priest',
    wowClass: 'Priest',
    primaryStat: 'intellect',
    role: 'healer',
  },
  {
    specId: 257,
    specName: 'Holy',
    className: 'Priest',
    wowClass: 'Priest',
    primaryStat: 'intellect',
    role: 'healer',
  },
  // Death Knight
  {
    specId: 250,
    specName: 'Blood',
    className: 'DeathKnight',
    wowClass: 'Death Knight',
    primaryStat: 'strength',
    role: 'tank',
  },
  // Shaman
  {
    specId: 264,
    specName: 'Restoration',
    className: 'Shaman',
    wowClass: 'Shaman',
    primaryStat: 'intellect',
    role: 'healer',
  },
  // Monk
  {
    specId: 268,
    specName: 'Brewmaster',
    className: 'Monk',
    wowClass: 'Monk',
    primaryStat: 'agility',
    role: 'tank',
  },
  {
    specId: 270,
    specName: 'Mistweaver',
    className: 'Monk',
    wowClass: 'Monk',
    primaryStat: 'intellect',
    role: 'healer',
  },
  // Druid
  {
    specId: 104,
    specName: 'Guardian',
    className: 'Druid',
    wowClass: 'Druid',
    primaryStat: 'agility',
    role: 'tank',
  },
  {
    specId: 105,
    specName: 'Restoration',
    className: 'Druid',
    wowClass: 'Druid',
    primaryStat: 'intellect',
    role: 'healer',
  },
  // Demon Hunter
  {
    specId: 581,
    specName: 'Vengeance',
    className: 'DemonHunter',
    wowClass: 'Demon Hunter',
    primaryStat: 'agility',
    role: 'tank',
  },
  // Evoker
  {
    specId: 1468,
    specName: 'Preservation',
    className: 'Evoker',
    wowClass: 'Evoker',
    primaryStat: 'intellect',
    role: 'healer',
  },
];

const SPECS: SpecInfo[] = [
  ...DPS_SPECS.map((s) => ({ ...s, role: 'dps' as const, supported: true })),
  ...OFF_ROLE_SPECS.map((s) => ({ ...s, supported: false })),
];

// Une dérivation du drapeau, jamais une seconde liste : ajouter une spec ne se fait qu'au-dessus.
export const ALL_DPS_SPEC_IDS = SPECS.filter((s) => s.supported).map((s) => s.specId);

const SPEC_MAP = new Map(SPECS.map((s) => [s.specId, s]));

/**
 * Rend **toute** spec connue, supportée ou non. C'est délibéré : qui veut refuser a besoin du
 * nom de ce qu'il refuse. Corollaire — un appelant qui décide d'analyser doit tester `supported`
 * lui-même ; un `getSpecInfo(id)` non nul ne dit plus « c'est du DPS ».
 */
export function getSpecInfo(specId: number): SpecInfo | null {
  return SPEC_MAP.get(specId) ?? null;
}

// Warcraft Logs nomme la spec sans espace dans ses classements (`BeastMastery`), exactement
// comme `specName` ici : la clé se compose donc telle quelle, sans normalisation.
const SPEC_BY_NAME = new Map(
  SPECS.filter((s) => s.supported).map((s) => [`${s.wowClass}|${s.specName}`, s])
);

/** Résout le couple (classe, spec) rendu par WCL en spec connue. `null` si ce n'est pas du DPS. */
export function getSpecByName(wowClass: string, specName: string): SpecInfo | null {
  return SPEC_BY_NAME.get(`${wowClass}|${specName}`) ?? null;
}

export function getDpsSpecsForClass(wowClass: string): SpecInfo[] {
  return SPECS.filter((s) => s.supported && s.wowClass === wowClass);
}

export function getAllWowClasses(): string[] {
  return [...new Set(SPECS.filter((s) => s.supported).map((s) => s.wowClass))];
}

const ROLE_LABELS: Record<SpecRole, string> = { dps: 'DPS', healer: 'soin', tank: 'tank' };

/**
 * Le nom d'une spec tel que Warcraft Logs la nomme — le joueur retrouve la même chaîne sur la
 * page source. `wowClass` et non `className` : « Frost Death Knight », pas « Frost DeathKnight ».
 */
export function specLabel(info: SpecInfo): string {
  return `${info.specName} ${info.wowClass}`;
}

/**
 * Le rôle en français, seul mot traduit. Traduire les trente-huit noms de spec serait une table
 * à entretenir à chaque extension, pour un message de refus.
 */
export function roleLabel(role: SpecRole): string {
  return ROLE_LABELS[role];
}
