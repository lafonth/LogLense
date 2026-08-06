import type { CombatantEvent } from '../combatant';
import type { EligibilityProfile } from '../eligibility';
import type { WCLTable } from '../parsers';
import { describe, expect, it } from 'vitest';
import { EXTERNAL_TOLERANCE } from '../constants';
import { disqualify, eligibilityOf, externalsOf, tierBonus, tierPiecesOf } from '../eligibility';

function combatant(gear?: CombatantEvent['gear']): CombatantEvent {
  return { sourceID: 4, specID: 103, gear } as CombatantEvent;
}

function piece(setID?: number) {
  return { itemLevel: 640, id: 1, quality: 4, ...(setID === undefined ? {} : { setID }) };
}

function auras(...entries: { guid: number; totalUptime: number }[]): WCLTable {
  return { data: { auras: entries.map((e) => ({ ...e, name: `spell-${e.guid}` })) } } as WCLTable;
}

const FIGHT_MS = 300000;

describe('tierPiecesOf', () => {
  it('counts the pieces of the largest set worn', () => {
    expect(tierPiecesOf(combatant([piece(1983), piece(1983), piece(1983), piece()]))).toBe(3);
  });

  it('keeps the larger half when a player carries two tiers at once', () => {
    // Mid-transition: three pieces of the new set, two of the old. The bonus held is 2p
    // of one and 2p of the other — but only the larger group can reach 4p.
    const gear = [piece(1983), piece(1983), piece(1983), piece(1701), piece(1701)];
    expect(tierPiecesOf(combatant(gear))).toBe(3);
  });

  it('reports zero when gear is present but carries no set at all', () => {
    expect(tierPiecesOf(combatant([piece(), piece()]))).toBe(0);
  });

  it('reports null when the fight carries no gear', () => {
    // Unknown, not zero: a hole in the report must not read as a naked player.
    expect(tierPiecesOf(combatant([]))).toBeNull();
    expect(tierPiecesOf(combatant())).toBeNull();
  });
});

describe('tierBonus', () => {
  it('rounds a piece count down to the bonus it actually grants', () => {
    expect(tierBonus(5)).toBe(4);
    expect(tierBonus(4)).toBe(4);
    expect(tierBonus(3)).toBe(2);
    expect(tierBonus(2)).toBe(2);
    expect(tierBonus(1)).toBe(0);
    expect(tierBonus(0)).toBe(0);
  });

  it('carries the unknown through instead of resolving it', () => {
    expect(tierBonus(null)).toBeNull();
  });
});

describe('externalsOf', () => {
  it('sums the uptime of the offensive externals, in points of fight duration', () => {
    const table = auras({ guid: 10060, totalUptime: 60000 }, { guid: 410089, totalUptime: 30000 });

    expect(externalsOf(table, FIGHT_MS)).toEqual({
      externalUptime: 30,
      externals: ['Power Infusion', 'Prescience'],
    });
  });

  it('ignores buffs that are not targeted offensive externals', () => {
    // A raid-wide buff everybody holds distorts nothing, so it must not count.
    const table = auras({ guid: 1459, totalUptime: FIGHT_MS });

    expect(externalsOf(table, FIGHT_MS)).toEqual({ externalUptime: 0, externals: [] });
  });

  it('matches by spell id, not by name', () => {
    // Same buff as reported by a localised client — the name is different, the id is not.
    const table: WCLTable = {
      data: { auras: [{ guid: 10060, name: 'Infusion de pouvoir', totalUptime: 30000 }] },
    } as WCLTable;

    expect(externalsOf(table, FIGHT_MS).externals).toEqual(['Power Infusion']);
  });

  it('returns nothing rather than dividing by a zero-length fight', () => {
    expect(externalsOf(auras({ guid: 10060, totalUptime: 1000 }), 0)).toEqual({
      externalUptime: 0,
      externals: [],
    });
  });

  it('tolerates a buff table with no auras', () => {
    expect(externalsOf({} as WCLTable, FIGHT_MS)).toEqual({ externalUptime: 0, externals: [] });
  });
});

describe('eligibilityOf', () => {
  it('assembles the gear and the buffs into one profile', () => {
    const profile = eligibilityOf(
      combatant([piece(1983), piece(1983)]),
      auras({ guid: 395152, totalUptime: 150000 }),
      FIGHT_MS
    );

    expect(profile).toEqual({
      tierPieces: 2,
      externalUptime: 50,
      externals: ['Ebon Might'],
    });
  });
});

describe('disqualify', () => {
  function profile(over: Partial<EligibilityProfile> = {}): EligibilityProfile {
    return { tierPieces: 4, externalUptime: 0, externals: [], ...over };
  }

  it('eliminates a candidate wearing a higher set bonus than the player', () => {
    expect(disqualify(profile({ tierPieces: 4 }), profile({ tierPieces: 2 }))).toEqual([
      'set-bonus',
    ]);
  });

  it('keeps a candidate wearing a lower set bonus', () => {
    // It beat the player with less. That is the reference worth reading, not the one to drop.
    expect(disqualify(profile({ tierPieces: 2 }), profile({ tierPieces: 4 }))).toEqual([]);
  });

  it('keeps a candidate whose piece count differs but whose bonus does not', () => {
    expect(disqualify(profile({ tierPieces: 5 }), profile({ tierPieces: 4 }))).toEqual([]);
    expect(disqualify(profile({ tierPieces: 3 }), profile({ tierPieces: 2 }))).toEqual([]);
  });

  it('never eliminates on an unknown tier, on either side', () => {
    expect(disqualify(profile({ tierPieces: null }), profile({ tierPieces: 0 }))).toEqual([]);
    expect(disqualify(profile({ tierPieces: 4 }), profile({ tierPieces: null }))).toEqual([]);
  });

  it('eliminates a candidate handed more external uptime than the player, beyond tolerance', () => {
    const mine = profile({ externalUptime: 10 });

    expect(disqualify(profile({ externalUptime: 10 + EXTERNAL_TOLERANCE + 1 }), mine)).toEqual([
      'external',
    ]);
    // Exactly at the tolerance is still comparable — the boundary is the margin, not a hit.
    expect(disqualify(profile({ externalUptime: 10 + EXTERNAL_TOLERANCE }), mine)).toEqual([]);
  });

  it('keeps a candidate who received fewer externals than the player', () => {
    expect(disqualify(profile({ externalUptime: 0 }), profile({ externalUptime: 40 }))).toEqual([]);
  });

  it('reports both reasons when both apply', () => {
    const candidate = profile({ tierPieces: 4, externalUptime: 40 });
    const mine = profile({ tierPieces: 0, externalUptime: 0 });

    expect(disqualify(candidate, mine)).toEqual(['set-bonus', 'external']);
  });
});
