export const TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';
export const API_URL = 'https://www.warcraftlogs.com/api/v2/client';

export const FERAL_SPEC_ID = 103;
export const KILL_TIME_TOLERANCE = 0.2;
export const TOP_N = 3;

export const TRACKED_ABILITIES: Record<string, number> = {
  "Tiger's Fury": 5217,
  Berserk: 106951,
  Incarnation: 102543,
  'Feral Frenzy': 274837,
  'Frantic Frenzy': 1243807,
  'Convoke the Spirits': 391528,
  Rip: 1079,
  Rake: 1822,
  'Ferocious Bite': 22568,
  'Primal Wrath': 285381,
  Shred: 5221,
  Swipe: 106785,
  Thrash: 106832,
  Moonfire: 8921,
  'Moonfire (LI)': 155625,
  'Brutal Slash': 202028,
};

export const GUID_TO_NAME: Record<number, string> = Object.fromEntries(
  Object.entries(TRACKED_ABILITIES).map(([name, id]) => [id, name])
);

export const UPTIME_BUFFS = new Set(["Tiger's Fury"]);
export const UPTIME_DEBUFFS = new Set(['Rip', 'Rake']);
