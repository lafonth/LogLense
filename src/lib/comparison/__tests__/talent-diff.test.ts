import type { TalentNode, TopPlayer } from '@/types';
import { describe, expect, it } from 'vitest';
import { diffTalents } from '../talent-diff';

function node(id: number, talentIds: number[], name: string): TalentNode {
  return {
    id,
    talentIds,
    name,
    names: [name],
    spellId: id,
    // Distinct row per node — dedupeByPosition collapses nodes sharing a (tree, row, col).
    row: id,
    col: 0,
    maxRanks: 3,
    nodeType: 'single',
    treeType: 'spec',
    children: [],
  };
}

function player(name: string, talents: Record<number, number>): TopPlayer {
  return {
    stats: {
      name,
      avgIlvl: 639,
      primaryStat: 0,
      crit: 0,
      haste: 0,
      mastery: 0,
      vers: 0,
      talents,
      dps: 300000,
      killTime: '4:23',
    },
    rotation: { name, fightDurationMs: 263000, casts: {}, buffs: {} },
    damageTable: { entries: [] },
  };
}

const NODES = [
  node(1, [101], 'Sabertooth'),
  node(2, [102], 'Veinripper'),
  node(3, [103], 'Rip'),
  node(4, [104, 105], 'Wild Slashes'),
];

const REFERENCES = [
  player('Aidan', { 102: 3, 103: 1, 104: 2 }),
  player('Brea', { 102: 3, 103: 1 }),
  player('Cass', { 103: 1, 105: 1 }),
];

describe('diffTalents', () => {
  const result = diffTalents(NODES, { 101: 1, 103: 1 }, REFERENCES);

  it('lists what only the player took', () => {
    expect(result.mineOnly.map((e) => e.label)).toEqual(['Sabertooth']);
    expect(result.mineOnly[0].myRank).toBe(1);
    expect(result.mineOnly[0].referenceCount).toBe(0);
  });

  it('lists what only the references took, with how many took it', () => {
    expect(result.theirsOnly.map((e) => [e.label, e.referenceCount])).toEqual([
      ['Veinripper', 2],
      ['Wild Slashes', 2],
    ]);
  });

  it('counts a node taken through any of its talent ids', () => {
    // Wild Slashes is id 104 for Aidan and 105 for Cass — both count.
    expect(result.theirsOnly.find((e) => e.label === 'Wild Slashes')?.referenceCount).toBe(2);
  });

  it('collapses nodes both sides took into a count', () => {
    expect(result.sharedCount).toBe(1); // Rip
    expect(result.referenceTotal).toBe(3);
  });

  it('sorts theirsOnly by how many references took it, descending', () => {
    const counts = result.theirsOnly.map((e) => e.referenceCount);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('treats every taken node as mine-only when there are no references', () => {
    const solo = diffTalents(NODES, { 101: 1, 103: 1 }, []);

    expect(solo.mineOnly.map((e) => e.label)).toEqual(['Sabertooth', 'Rip']);
    expect(solo.theirsOnly).toEqual([]);
    expect(solo.sharedCount).toBe(0);
    expect(solo.referenceTotal).toBe(0);
  });
});
