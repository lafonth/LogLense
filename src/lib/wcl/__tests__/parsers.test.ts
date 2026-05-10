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
  it('calculates uptime percentage for wanted abilities', () => {
    const table = {
      data: {
        auras: [
          { guid: 5217, name: "Tiger's Fury", totalUptime: 30000, totalUses: 5 },
          { guid: 9999, name: 'Other Buff', totalUptime: 60000, totalUses: 1 },
        ],
      },
    };
    const wanted = new Set(["Tiger's Fury"]);
    const result = parseUptime(table, 120000, wanted);

    expect(result["Tiger's Fury"]).toBeDefined();
    expect(result["Tiger's Fury"].uptimePct).toBe(25);
    expect(result['Other Buff']).toBeUndefined();
  });
});

describe('summarizeRotation', () => {
  it('combines Moonfire + Moonfire (LI) into single Moonfire entry', () => {
    const casts = {
      Moonfire: { casts: 3, perMin: 1 },
      'Moonfire (LI)': { casts: 6, perMin: 2 },
      "Tiger's Fury": { casts: 10, perMin: 5 },
      Berserk: { casts: 4, perMin: 2 },
      Incarnation: { casts: 0, perMin: 0 },
      'Feral Frenzy': { casts: 2, perMin: 1 },
      'Frantic Frenzy': { casts: 0, perMin: 0 },
      'Convoke the Spirits': { casts: 2, perMin: 1 },
      Shred: { casts: 40, perMin: 20 },
      Swipe: { casts: 5, perMin: 2.5 },
      Rip: { casts: 8, perMin: 4 },
      'Ferocious Bite': { casts: 12, perMin: 6 },
      'Primal Wrath': { casts: 0, perMin: 0 },
    };
    const buffUptime = { "Tiger's Fury": { uptimePct: 28, applications: 10 } };
    const debuffUptime = {
      Rip: { uptimePct: 88, applications: 8 },
      Rake: { uptimePct: 92, applications: 10 },
    };

    const summary = summarizeRotation('Jumbaa', casts, buffUptime, debuffUptime, 120000, 250000);

    expect(summary.generators.Moonfire.casts).toBe(9);
    expect(summary.cooldowns.Berserk.casts).toBe(4);
    expect(summary.uptime["Tiger's Fury %"]).toBe(28);
    expect(summary.uptime['Rip %']).toBe(88);
    expect(summary.dps).toBe(250000);
  });
});
