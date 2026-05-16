export type PrimaryStat = 'agility' | 'strength' | 'intellect';

export interface SpecInfo {
  specId: number;
  specName: string;
  className: string;
  wowClass: string;
  primaryStat: PrimaryStat;
}

const SPECS: SpecInfo[] = [
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

export const ALL_DPS_SPEC_IDS = SPECS.map((s) => s.specId);

const SPEC_MAP = new Map(SPECS.map((s) => [s.specId, s]));

export function getSpecInfo(specId: number): SpecInfo | null {
  return SPEC_MAP.get(specId) ?? null;
}

export function getDpsSpecsForClass(wowClass: string): SpecInfo[] {
  return SPECS.filter((s) => s.wowClass === wowClass);
}

export function getAllWowClasses(): string[] {
  return [...new Set(SPECS.map((s) => s.wowClass))];
}
