import type { CharacterStats, ReferenceSample } from '@/types';
import { describe, expect, it } from 'vitest';
import { describeStats, describeValues, usableSample } from '../stat-distribution';

function stats(over: Partial<CharacterStats> = {}): CharacterStats {
  return {
    name: 'Ref',
    avgIlvl: 640,
    primaryStat: 13000,
    crit: 4000,
    haste: 3500,
    mastery: 5800,
    vers: 800,
    talents: {},
    ...over,
  };
}

function entry(name: string, avgIlvl: number, qualified = true): ReferenceSample {
  return {
    name,
    code: `code-${name}`,
    fightID: 1,
    actorId: 4,
    stats: stats({ name, avgIlvl }),
    dps: 300000,
    killTimeMs: 200000,
    qualified,
  };
}

describe('describeValues', () => {
  it('returns null on an empty sample rather than an empty distribution', () => {
    expect(describeValues(10, [])).toBeNull();
  });

  it('takes the middle value as median on an odd sample', () => {
    expect(describeValues(0, [3, 1, 2])?.median).toBe(2);
  });

  it('averages the two middle values on an even sample', () => {
    expect(describeValues(0, [1, 2, 3, 4])?.median).toBe(2.5);
  });

  it('reports min and max from the sample, not from my own value', () => {
    const dist = describeValues(100, [1, 2, 3]);

    expect(dist).toMatchObject({ mine: 100, min: 1, max: 3, sampleSize: 3 });
  });

  it('places a value below the whole sample at p0 and above it at p100', () => {
    expect(describeValues(0, [1, 2, 3])?.percentile).toBe(0);
    expect(describeValues(4, [1, 2, 3])?.percentile).toBe(100);
  });

  it('counts ties for half, so the exact centre of a symmetric sample reads p50', () => {
    // Rang moyen : sans le demi-comptage des ex æquo, 2 donnerait p33 ou p67 selon le
    // sens de la comparaison, alors que sa position est symétrique.
    expect(describeValues(2, [1, 2, 3])?.percentile).toBe(50);
    expect(describeValues(2, [2, 2])?.percentile).toBe(50);
  });
});

describe('usableSample', () => {
  it('keeps only the qualified entries when there are any', () => {
    const { entries, includesDisqualified } = usableSample([
      entry('a', 640),
      entry('b', 645, false),
    ]);

    expect(entries.map((e) => e.name)).toEqual(['a']);
    expect(includesDisqualified).toBe(false);
  });

  it('falls back on the whole sample when none qualified, and says so', () => {
    const { entries, includesDisqualified } = usableSample([
      entry('a', 640, false),
      entry('b', 645, false),
    ]);

    expect(entries).toHaveLength(2);
    expect(includesDisqualified).toBe(true);
  });

  it('does not claim a disqualified fallback on an empty sample', () => {
    expect(usableSample([])).toEqual({ entries: [], includesDisqualified: false });
  });
});

describe('describeStats', () => {
  it('describes every axis against the qualified entries only', () => {
    const result = describeStats(stats({ avgIlvl: 638 }), [
      entry('a', 636),
      entry('b', 640),
      entry('c', 700, false),
    ]);

    expect(result.sampleSize).toBe(2);
    expect(result.includesDisqualified).toBe(false);

    const ilvl = result.stats.find((s) => s.key === 'avgIlvl');
    expect(ilvl).toMatchObject({ label: 'Avg ilvl', mine: 638, min: 636, median: 638, max: 640 });
    expect(result.stats).toHaveLength(6);
  });

  it('returns no axis at all when there is nothing to compare against', () => {
    const result = describeStats(stats(), []);

    expect(result.stats).toEqual([]);
    expect(result.sampleSize).toBe(0);
  });
});
