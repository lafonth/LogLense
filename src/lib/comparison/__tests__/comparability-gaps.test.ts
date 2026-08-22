import type { Comparability } from '@/types';
import { describe, expect, it } from 'vitest';
import { ilvlGapOf, killTimeGapPctOf } from '../comparability-gaps';

function comparability(over: Partial<Comparability> = {}): Comparability {
  return {
    level: 'close',
    referenceIlvl: 645,
    referenceIlvlCount: 3,
    myIlvl: 639,
    referenceKillTimeMs: 285_000,
    myKillTimeMs: 300_000,
    candidatesConsidered: 30,
    pagesFetched: 10,
    disqualified: 4,
    unverifiable: 1,
    substituted: 0,
    ...over,
  };
}

describe('ilvlGapOf', () => {
  it('measures the references against me, signed their way', () => {
    expect(ilvlGapOf(comparability())).toBe(6);
    expect(ilvlGapOf(comparability({ referenceIlvl: 630 }))).toBe(-9);
  });

  it('rounds to the tenth the screen reads', () => {
    expect(ilvlGapOf(comparability({ referenceIlvl: 645.26 }))).toBe(6.3);
    expect(ilvlGapOf(comparability({ referenceIlvl: 645.24 }))).toBe(6.2);
  });

  it('keeps the sign of a gap that rounds away, rather than turning it positive', () => {
    expect(Object.is(ilvlGapOf(comparability({ referenceIlvl: 638.99 })), -0)).toBe(true);
    expect(Object.is(ilvlGapOf(comparability({ referenceIlvl: 639.01 })), 0)).toBe(true);
  });

  it('says nothing when the median says nothing', () => {
    expect(ilvlGapOf(comparability({ referenceIlvl: null }))).toBeNull();
  });
});

describe('killTimeGapPctOf', () => {
  it('measures the reference kills against mine, in points of my duration', () => {
    expect(killTimeGapPctOf(comparability())).toBe(-5);
    expect(killTimeGapPctOf(comparability({ referenceKillTimeMs: 330_000 }))).toBe(10);
  });

  it('rounds to the tenth, keeping the sign of a gap that rounds away', () => {
    expect(killTimeGapPctOf(comparability({ referenceKillTimeMs: 300_160 }))).toBe(0.1);
    expect(Object.is(killTimeGapPctOf(comparability({ referenceKillTimeMs: 299_900 })), -0)).toBe(
      true
    );
  });

  it('says nothing when the median says nothing', () => {
    expect(killTimeGapPctOf(comparability({ referenceKillTimeMs: null }))).toBeNull();
  });

  it('says nothing on a null duration, which is a duration we do not have', () => {
    expect(killTimeGapPctOf(comparability({ myKillTimeMs: 0 }))).toBeNull();
  });
});
