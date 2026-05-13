import { describe, expect, it } from 'vitest';
import { fmtMs, parseCasts, parseStats, parseUptime, summarizeRotation } from '../parsers';

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
    expect(stats!.agility).toBe(13200);
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
      "Tiger's Fury": { casts: 10, perMin: 5 },
      Shred: { casts: 40, perMin: 20 },
      Rip: { casts: 8, perMin: 4 },
    };
    const buffs = { "Tiger's Fury": 28 };

    const summary = summarizeRotation('Jumbaa', casts, buffs, 120000, 250000);

    expect(summary.casts['Shred'].casts).toBe(40);
    expect(summary.casts["Tiger's Fury"].casts).toBe(10);
    expect(summary.buffs["Tiger's Fury"]).toBe(28);
    expect(summary.dps).toBe(250000);
  });
});
