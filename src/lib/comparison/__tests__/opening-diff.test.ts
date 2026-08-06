import type { OpeningSource } from '../opening-diff';
import type { OpeningCast } from '@/types';
import { describe, expect, it } from 'vitest';
import { diffOpening } from '../opening-diff';

function opening(names: string[]): OpeningCast[] {
  return names.map((name, i) => ({ guid: i + 1, name, offsetMs: i * 1500 }));
}

function reference(names: string[]): OpeningSource {
  return { rotation: { opening: opening(names) } };
}

describe('diffOpening', () => {
  it('reports no divergence when the sequence matches the majority throughout', () => {
    const result = diffOpening(opening(["Tiger's Fury", 'Shred', 'Rip']), [
      reference(["Tiger's Fury", 'Shred', 'Rip']),
      reference(["Tiger's Fury", 'Shred', 'Rip']),
    ]);

    expect(result.firstDivergence).toBeNull();
    expect(result.referenceTotal).toBe(2);
    expect(result.steps.every((s) => s.matches)).toBe(true);
  });

  it('flags the first rank that leaves the majority, not every later mismatch', () => {
    const result = diffOpening(opening(["Tiger's Fury", 'Rip', 'Shred']), [
      reference(["Tiger's Fury", 'Shred', 'Rip']),
      reference(["Tiger's Fury", 'Shred', 'Rip']),
    ]);

    expect(result.firstDivergence).toBe(1);
    expect(result.steps[1]).toMatchObject({ mine: 'Rip', consensus: 'Shred', consensusCount: 2 });
  });

  it('takes the majority spell, not the first reference seen', () => {
    const result = diffOpening(opening(['Shred']), [
      reference(['Rake']),
      reference(['Shred']),
      reference(['Shred']),
    ]);

    expect(result.steps[0]).toMatchObject({ consensus: 'Shred', consensusCount: 2, matches: true });
    expect(result.firstDivergence).toBeNull();
  });

  it('drops references without an opening from the count rather than counting them as disagreement', () => {
    const result = diffOpening(opening(['Shred']), [
      reference(['Shred']),
      { rotation: { opening: [] } },
    ]);

    expect(result.referenceTotal).toBe(1);
    expect(result.steps[0].consensusCount).toBe(1);
    expect(result.firstDivergence).toBeNull();
  });

  it('keeps my ranks with an empty consensus when no reference has an opening', () => {
    const result = diffOpening(opening(['Shred', 'Rip']), [{ rotation: { opening: [] } }]);

    expect(result.referenceTotal).toBe(0);
    expect(result.steps).toHaveLength(2);
    expect(result.steps.every((s) => s.consensus === null)).toBe(true);
    // Sans consensus il n'y a pas de divergence : on ne sait pas, on ne juge pas.
    expect(result.firstDivergence).toBeNull();
  });

  it('extends to the longest sequence, mine or theirs', () => {
    const result = diffOpening(opening(['Shred']), [reference(['Shred', 'Rip'])]);

    expect(result.steps).toHaveLength(2);
    expect(result.steps[1]).toMatchObject({ mine: null, consensus: 'Rip', matches: false });
    expect(result.firstDivergence).toBe(1);
  });

  it('returns nothing to show when neither side has an opening', () => {
    expect(diffOpening([], [])).toEqual({ steps: [], referenceTotal: 0, firstDivergence: null });
  });
});
