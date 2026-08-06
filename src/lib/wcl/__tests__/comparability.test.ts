import { describe, expect, it } from 'vitest';
import { comparabilityLevel, medianOf, scoreCandidate, selectClosest } from '../comparability';

const MY_ILVL = 284;
const MY_MS = 300000; // 5:00

describe('scoreCandidate', () => {
  it('is zero for a candidate identical to the player', () => {
    expect(scoreCandidate({ bracketData: 284, duration: 300000 }, MY_ILVL, MY_MS)).toBe(0);
  });

  it('is 1 when a single criterion sits exactly at its tolerance', () => {
    // 4 ilvl away, same kill time: 4/4 = 1 on one axis, 0 on the other
    expect(scoreCandidate({ bracketData: 288, duration: 300000 }, MY_ILVL, MY_MS)).toBe(1);
    // 20% slower, same ilvl: 0.2/0.2 = 1
    expect(scoreCandidate({ bracketData: 284, duration: 360000 }, MY_ILVL, MY_MS)).toBe(1);
  });

  it('treats a gap as equally bad in either direction', () => {
    const above = scoreCandidate({ bracketData: 288, duration: 300000 }, MY_ILVL, MY_MS);
    const below = scoreCandidate({ bracketData: 280, duration: 300000 }, MY_ILVL, MY_MS);
    expect(above).toBe(below);
  });

  it('combines the two axes so one good criterion does not excuse the other', () => {
    // at tolerance on both: sqrt(1 + 1)
    const both = scoreCandidate({ bracketData: 288, duration: 360000 }, MY_ILVL, MY_MS);
    expect(both).toBeCloseTo(Math.SQRT2, 5);
  });

  it('sorts a candidate with no ilvl after every scorable one', () => {
    expect(scoreCandidate({ duration: 300000 }, MY_ILVL, MY_MS)).toBe(Number.POSITIVE_INFINITY);
  });

  it('returns Infinity when the player has no item level', () => {
    expect(scoreCandidate({ bracketData: 284, duration: 300000 }, 0, MY_MS)).toBe(
      Number.POSITIVE_INFINITY
    );
  });

  it('treats the kill-time gap as zero rather than dividing by zero', () => {
    expect(scoreCandidate({ bracketData: 284, duration: 5000 }, MY_ILVL, 0)).toBe(0);
  });
});

describe('selectClosest', () => {
  const candidates = [
    { name: 'far-strong', bracketData: 296, duration: 200000 },
    { name: 'near', bracketData: 285, duration: 310000 },
    { name: 'mid', bracketData: 290, duration: 330000 },
    { name: 'no-ilvl', duration: 300000 },
  ];

  it('returns the closest candidates, not the fastest ones', () => {
    const picked = selectClosest(candidates, MY_ILVL, MY_MS, 2);
    expect(picked.map((p) => p.candidate.name)).toEqual(['near', 'mid']);
  });

  it('keeps an unscorable candidate last rather than dropping it', () => {
    const picked = selectClosest(candidates, MY_ILVL, MY_MS, 4);
    expect(picked[3].candidate.name).toBe('no-ilvl');
    expect(picked[3].distance).toBe(Number.POSITIVE_INFINITY);
  });

  it('returns an empty list for an empty pool', () => {
    expect(selectClosest([], MY_ILVL, MY_MS, 3)).toEqual([]);
  });

  it('attaches the distance it sorted on', () => {
    const [first] = selectClosest(candidates, MY_ILVL, MY_MS, 1);
    expect(first.distance).toBeCloseTo(
      scoreCandidate({ bracketData: 285, duration: 310000 }, MY_ILVL, MY_MS),
      5
    );
  });
});

describe('comparabilityLevel', () => {
  const at = (distance: number) => ({ candidate: null, distance });

  it('is none for an empty selection', () => {
    expect(comparabilityLevel([])).toBe('none');
  });

  it('is close at a median distance of exactly 1', () => {
    expect(comparabilityLevel([at(0.5), at(1), at(1)])).toBe('close');
  });

  it('is approximate at a median distance of exactly 2', () => {
    expect(comparabilityLevel([at(1.5), at(2), at(2)])).toBe('approximate');
  });

  it('is poor beyond 2', () => {
    expect(comparabilityLevel([at(3), at(4), at(5)])).toBe('poor');
  });

  it('is poor when every candidate is unscorable', () => {
    expect(comparabilityLevel([at(Number.POSITIVE_INFINITY)])).toBe('poor');
  });

  it('is poor, not close, when the player has no item level', () => {
    const candidates = [
      { name: 'near', bracketData: 285, duration: 310000 },
      { name: 'mid', bracketData: 290, duration: 330000 },
    ];
    const scored = selectClosest(candidates, 0, MY_MS, candidates.length);
    expect(comparabilityLevel(scored)).toBe('poor');
  });
});

describe('medianOf', () => {
  it('averages the two middle values for an even count', () => {
    expect(medianOf([1, 2, 3, 4])).toBe(2.5);
  });

  it('returns the middle value for an odd count', () => {
    expect(medianOf([3, 1, 2])).toBe(2);
  });

  it('returns null for an empty list', () => {
    expect(medianOf([])).toBeNull();
  });
});
