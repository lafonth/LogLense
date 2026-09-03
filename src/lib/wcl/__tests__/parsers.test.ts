import type { CastEvent } from '../parsers';
import { describe, expect, it } from 'vitest';
import {
  fmtMs,
  parseCastChain,
  parseCasts,
  parseOpening,
  parseStats,
  parseUptime,
  summarizeRotation,
} from '../parsers';

describe('fmtMs', () => {
  it('formats milliseconds to M:SS', () => {
    expect(fmtMs(263000)).toBe('4:23');
    expect(fmtMs(60000)).toBe('1:00');
    expect(fmtMs(75000)).toBe('1:15');
  });
});

describe('parseStats', () => {
  it('returns null for null event', () => {
    expect(parseStats(null, 'Player')).toBeNull();
  });

  it('parses stats from a combatant event', () => {
    const event = {
      specID: 103,
      gear: [
        { itemLevel: 635, id: 1, quality: 4 },
        { itemLevel: 620, id: 2, quality: 4 },
        { itemLevel: 10, id: 3, quality: 1 },
      ],
      agility: 13200,
      critMelee: 3890,
      hasteMelee: 3500,
      mastery: 5800,
      versatilityDamageDone: 750,
      talentTree: [
        { id: 395152, rank: 1 },
        { id: 391528, rank: 1 },
      ],
    };

    const stats = parseStats(event, 'Jumbaa');
    expect(stats).not.toBeNull();
    expect(stats!.name).toBe('Jumbaa');
    expect(stats!.avgIlvl).toBe(627.5);
    expect(stats!.primaryStat).toBe(13200);
    expect(stats!.crit).toBe(3890);
    expect(stats!.haste).toBe(3500);
    expect(stats!.mastery).toBe(5800);
    expect(stats!.vers).toBe(750);
    expect(stats!.talents).toEqual({ 395152: 1, 391528: 1 });
  });
});

describe('parseCasts', () => {
  it('converts cast counts to casts-per-minute', () => {
    const table = {
      data: {
        entries: [
          { guid: 5217, name: "Tiger's Fury", total: 10 },
          { guid: 99999, name: 'Unknown Spell', total: 5 },
        ],
      },
    };
    const result = parseCasts(table, 120000);

    expect(result["Tiger's Fury"].casts).toBe(10);
    expect(result["Tiger's Fury"].perMin).toBe(5);
    expect(result['Unknown Spell'].casts).toBe(5);
  });
});

describe('parseUptime', () => {
  it('returns uptime percentage for all auras', () => {
    const table = {
      data: {
        auras: [
          { guid: 5217, name: "Tiger's Fury", totalUptime: 30000, totalUses: 5 },
          { guid: 9999, name: 'Other Buff', totalUptime: 60000, totalUses: 1 },
        ],
      },
    };
    const result = parseUptime(table, 120000);

    expect(result["Tiger's Fury"]).toBe(25);
    expect(result['Other Buff']).toBe(50);
  });
});

describe('summarizeRotation', () => {
  it('passes through casts and buffs as-is', () => {
    const casts = {
      "Tiger's Fury": { guid: 5217, casts: 10, perMin: 5 },
      Shred: { guid: 5221, casts: 40, perMin: 20 },
      Rip: { guid: 1079, casts: 8, perMin: 4 },
    };
    const buffs = { "Tiger's Fury": 28 };

    const summary = summarizeRotation('Jumbaa', casts, buffs, 120000, [], 250000);

    expect(summary.casts.Shred.casts).toBe(40);
    expect(summary.casts["Tiger's Fury"].casts).toBe(10);
    expect(summary.buffs["Tiger's Fury"]).toBe(28);
    expect(summary.dps).toBe(250000);
  });
});

describe('parseOpening', () => {
  const NAMES = {
    data: {
      entries: [
        { guid: 5217, name: "Tiger's Fury", total: 10 },
        { guid: 5221, name: 'Shred', total: 60 },
        { guid: 1079, name: 'Rip', total: 9 },
      ],
    },
  };

  function event(timestamp: number, abilityGameID: number, type = 'cast'): CastEvent {
    return { timestamp, type, abilityGameID };
  }

  it('keeps the order and counts offsets from the first cast, not from the pull', () => {
    const opening = parseOpening(
      [event(103000, 5217), event(104500, 5221), event(106000, 1079)],
      NAMES,
      12
    );

    expect(opening.map((c) => c.name)).toEqual(["Tiger's Fury", 'Shred', 'Rip']);
    expect(opening.map((c) => c.offsetMs)).toEqual([0, 1500, 3000]);
  });

  it('drops begincast so a channel is not counted twice', () => {
    const opening = parseOpening(
      [event(1000, 5221, 'begincast'), event(2500, 5221), event(4000, 1079)],
      NAMES,
      12
    );

    expect(opening.map((c) => c.name)).toEqual(['Shred', 'Rip']);
    expect(opening[0].offsetMs).toBe(0);
  });

  it('truncates to the requested length', () => {
    const events = [event(0, 5217), event(1000, 5221), event(2000, 1079)];
    expect(parseOpening(events, NAMES, 2)).toHaveLength(2);
  });

  it('gives the whole chain, sharing its offsets with the opening', () => {
    // Les deux lectures doivent nommer le même instant : l'ouverture est la tête de la
    // chaîne, pas un second parcours qui recompterait depuis son propre premier cast.
    const events = [event(103000, 5217), event(104500, 5221), event(106000, 1079)];
    const chain = parseCastChain(events, NAMES);

    expect(chain).toHaveLength(3);
    expect(chain.slice(0, 2)).toEqual(parseOpening(events, NAMES, 2));
  });

  it('falls back to the guid when the cast table does not name the ability', () => {
    const opening = parseOpening([event(0, 9999)], NAMES, 12);
    expect(opening[0]).toMatchObject({ guid: 9999, name: '#9999' });
  });

  it('prefers an inline ability name when WCL sends one', () => {
    const opening = parseOpening(
      [{ timestamp: 0, type: 'cast', ability: { guid: 9999, name: 'Convoke the Spirits' } }],
      NAMES,
      12
    );
    expect(opening[0]).toMatchObject({ guid: 9999, name: 'Convoke the Spirits' });
  });

  it('returns an empty opening when the log carries no usable cast event', () => {
    expect(parseOpening([], NAMES, 12)).toEqual([]);
    expect(parseOpening([event(0, 5221, 'begincast')], NAMES, 12)).toEqual([]);
  });
});
