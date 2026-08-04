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

  it('returns the player values alone when there are no references', () => {
    const rows = compareCasts(MINE, []);

    expect(rows.map((r) => r.name)).toEqual(['Shred', 'Ferocious Bite']);
    expect(rows[0].referenceMedian).toBeNull();
    expect(rows[0].deviationPct).toBeNull();
    expect(rows[0].referenceTotal).toBe(0);
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
});
