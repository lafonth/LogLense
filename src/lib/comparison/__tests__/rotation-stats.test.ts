import type { RotationSummary, TopPlayer } from '@/types';
import { describe, expect, it } from 'vitest';
import { compareCasts, compareUptimes } from '../rotation-stats';

function reference(
  name: string,
  perMin: Record<string, number>,
  buffs: Record<string, number> = {}
): TopPlayer {
  return {
    stats: {
      name,
      avgIlvl: 639,
      primaryStat: 0,
      crit: 0,
      haste: 0,
      mastery: 0,
      vers: 0,
      talents: {},
      dps: 300000,
      killTime: '4:23',
    },
    rotation: {
      name,
      fightDurationMs: 263000,
      casts: Object.fromEntries(
        Object.entries(perMin).map(([k, v]) => [k, { casts: Math.round(v * 4), perMin: v }])
      ),
      buffs,
    },
    damageTable: { entries: [] },
    provenance: {
      code: `code-${name}`,
      fightID: 1,
      name,
      ilvl: 639,
      killTimeMs: 263000,
      dps: 300000,
      distance: 0.5,
    },
  };
}

const MINE: RotationSummary = {
  name: 'Jumbaa',
  fightDurationMs: 263000,
  casts: {
    Shred: { casts: 36, perMin: 8.2 },
    'Ferocious Bite': { casts: 18, perMin: 4.1 },
  },
  buffs: { "Tiger's Fury": 42 },
};

const REFERENCES = [
  reference('Aidan', { Shred: 8, 'Ferocious Bite': 6.6, Thrash: 1.8 }, { "Tiger's Fury": 55 }),
  reference('Brea', { Shred: 8.4, 'Ferocious Bite': 7.2, Thrash: 1.6 }, { "Tiger's Fury": 51 }),
  reference('Cass', { Shred: 7.6, 'Ferocious Bite': 5.4, Thrash: 2.1 }, { "Tiger's Fury": 53 }),
];

describe('compareCasts', () => {
  const rows = compareCasts(MINE, REFERENCES);
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));

  it('reports the reference range rather than a single value', () => {
    expect(byName['Ferocious Bite'].referenceMin).toBe(5.4);
    expect(byName['Ferocious Bite'].referenceMax).toBe(7.2);
    expect(byName['Ferocious Bite'].referenceMedian).toBe(6.6);
  });

  it('computes the deviation against the median', () => {
    // (4.1 - 6.6) / 6.6 = -37.9 %
    expect(byName['Ferocious Bite'].deviationPct).toBe(-37.9);
  });

  it('counts an ability the player never casts as zero, not as absent', () => {
    expect(byName.Thrash.mine).toBe(0);
    expect(byName.Thrash.deviationPct).toBe(-100);
  });

  it('sorts by absolute deviation, largest first', () => {
    expect(rows.map((r) => r.name)).toEqual(['Thrash', 'Ferocious Bite', 'Shred']);
  });

  it('returns a null deviation when no reference uses the ability', () => {
    const soloAbility = compareCasts(
      { ...MINE, casts: { Swipe: { casts: 4, perMin: 1 } } },
      REFERENCES
    );

    expect(soloAbility.find((r) => r.name === 'Swipe')?.deviationPct).toBeNull();
  });

  it('returns a null median (not zero) when no reference used the ability at all', () => {
    // All references cast it zero times: the median is 0, which means "nothing to compare
    // against", not "everyone matched a true value of zero" — must be null, not 0.
    const noOneUsedIt = compareCasts({ ...MINE, casts: { Maim: { casts: 2, perMin: 0.5 } } }, [
      reference('Aidan', {}),
      reference('Brea', {}),
    ]);

    const row = noOneUsedIt.find((r) => r.name === 'Maim')!;
    expect(row.referenceMedian).toBeNull();
    expect(row.deviationPct).toBeNull();
  });

  it('rounds the deviation percentage symmetrically at an exact half-decimal', () => {
    // (1378.5 - 1000) / 1000 * 100 = 37.85 exactly — Math.round would push +37.85 up to
    // 37.9 but -37.85 down to -37.8, an asymmetric rounding of equidistant values.
    const positive = compareCasts({ ...MINE, casts: { Test: { casts: 1, perMin: 1378.5 } } }, [
      reference('Solo', { Test: 1000 }),
    ]);
    const negative = compareCasts({ ...MINE, casts: { Test: { casts: 1, perMin: 621.5 } } }, [
      reference('Solo', { Test: 1000 }),
    ]);

    expect(positive.find((r) => r.name === 'Test')?.deviationPct).toBe(37.9);
    expect(negative.find((r) => r.name === 'Test')?.deviationPct).toBe(-37.9);
  });

  it('returns the player values alone when there are no references', () => {
    const rows = compareCasts(MINE, []);

    expect(rows.map((r) => r.name)).toEqual(['Shred', 'Ferocious Bite']);
    expect(rows[0].referenceMedian).toBeNull();
    expect(rows[0].deviationPct).toBeNull();
    expect(rows[0].referenceTotal).toBe(0);
  });

  it('computes the median as an average of the two middle values for an even reference count', () => {
    const evenReferences = [
      reference('P1', { Rake: 3 }),
      reference('P2', { Rake: 5 }),
      reference('P3', { Rake: 7 }),
      reference('P4', { Rake: 9 }),
    ];
    const mine: RotationSummary = { ...MINE, casts: { Rake: { casts: 12, perMin: 3 } } };

    const rows = compareCasts(mine, evenReferences);
    const row = rows.find((r) => r.name === 'Rake')!;

    // sorted [3, 5, 7, 9] -> average of the two middle values (5, 7) = 6, not either middle value
    expect(row.referenceMedian).toBe(6);
    // (3 - 6) / 6 = -50 %
    expect(row.deviationPct).toBe(-50);
  });

  it('handles a larger reference set correctly', () => {
    const manyReferences = [2, 4, 6, 8, 10, 12].map((v, i) => reference(`P${i}`, { Wrath: v }));
    const mine: RotationSummary = { ...MINE, casts: { Wrath: { casts: 20, perMin: 5 } } };

    const rows = compareCasts(mine, manyReferences);
    const row = rows.find((r) => r.name === 'Wrath')!;

    expect(row.referenceMin).toBe(2);
    expect(row.referenceMax).toBe(12);
    expect(row.referenceTotal).toBe(6);
    // sorted [2, 4, 6, 8, 10, 12] -> average of the two middle values (6, 8) = 7
    expect(row.referenceMedian).toBe(7);
  });
});

describe('compareUptimes', () => {
  it('applies the same rules to buff uptimes', () => {
    const [row] = compareUptimes(MINE, REFERENCES);

    expect(row.name).toBe("Tiger's Fury");
    expect(row.mine).toBe(42);
    expect(row.referenceMin).toBe(51);
    expect(row.referenceMax).toBe(55);
    expect(row.deviationPct).toBe(-20.8); // (42 - 53) / 53
  });

  it('computes the median as an average of the two middle values for an even reference count', () => {
    const evenReferences = [
      reference('P1', {}, { Regrowth: 20 }),
      reference('P2', {}, { Regrowth: 30 }),
      reference('P3', {}, { Regrowth: 40 }),
      reference('P4', {}, { Regrowth: 50 }),
    ];
    const mine: RotationSummary = { ...MINE, buffs: { Regrowth: 20 } };

    const [row] = compareUptimes(mine, evenReferences);

    // sorted [20, 30, 40, 50] -> average of the two middle values (30, 40) = 35, not either middle value
    expect(row.referenceMedian).toBe(35);
    // (20 - 35) / 35 = -42.857...% rounded to one decimal
    expect(row.deviationPct).toBe(-42.9);
  });
});
