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
    rotation: { name, fightDurationMs: 263000, casts: {}, buffs: {}, opening: [] },
    damageTable: { entries: [] },
    provenance: {
      code: `code-${name}`,
      fightID: 1,
      actorId: 4,
      name,
      ilvl: 639,
      killTimeMs: 263000,
      dps: 300000,
      distance: 0.5,
      disqualifiedBy: [],
      tierPieces: 4,
      externalUptime: 0,
      explored: false,
    },
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
    // Wild Slashes' node has two distinct ids (104, 105) each taken by one reference — the
    // dominant (here, first-seen) id's count is reported, not the union across both ids.
    expect(result.theirsOnly.map((e) => [e.label, e.referenceCount])).toEqual([
      ['Veinripper', 2],
      ['Wild Slashes', 1],
    ]);
  });

  it('does not conflate different talent ids taken through the same node', () => {
    // Wild Slashes' node has two ids: 104 (Aidan) and 105 (Cass). These are two different
    // talents sharing a node, not one talent two references both took — only the
    // most-taken specific id counts, not the union of takers across both ids.
    expect(result.theirsOnly.find((e) => e.label === 'Wild Slashes')?.referenceCount).toBe(1);
  });

  it('collapses nodes both sides took into a count', () => {
    expect(result.sharedCount).toBe(1); // Rip
    expect(result.referenceTotal).toBe(3);
  });

  it('sorts theirsOnly by how many references took it, descending', () => {
    const counts = result.theirsOnly.map((e) => e.referenceCount);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it('sorts mineOnly ascending, so what nobody else took comes first', () => {
    // Two divergences with different backing: 601 nobody else took, 603 two of three did.
    // The lonely one is the one worth looking at — it must lead.
    const nodes = [node(10, [601], 'Solitary'), node(11, [603, 604], 'Contested')];
    const references = [
      player('Aidan', { 603: 1 }),
      player('Brea', { 603: 1 }),
      player('Cass', { 604: 1 }),
    ];

    const sorted = diffTalents(nodes, { 601: 1, 603: 1 }, references);

    expect(sorted.mineOnly.map((e) => [e.label, e.referenceCount])).toEqual([
      ['Solitary', 0],
      ['Contested', 2],
    ]);
  });

  it('treats every taken node as mine-only when there are no references', () => {
    const solo = diffTalents(NODES, { 101: 1, 103: 1 }, []);

    expect(solo.mineOnly.map((e) => e.label)).toEqual(['Sabertooth', 'Rip']);
    expect(solo.theirsOnly).toEqual([]);
    expect(solo.sharedCount).toBe(0);
    expect(solo.referenceTotal).toBe(0);
  });
});

describe('diffTalents choice-node divergence', () => {
  function choiceNode(id: number, talentIds: number[], names: string[]): TalentNode {
    return {
      id,
      talentIds,
      name: '',
      names,
      spellId: id,
      row: id,
      col: 0,
      maxRanks: 1,
      nodeType: 'choice',
      treeType: 'spec',
      children: [],
    };
  }

  it('does not report a choice node as shared when the player and references took different options', () => {
    // A mutually-exclusive choice: id 501 ("Savage Fury") vs id 502 ("Predatory Swiftness").
    // The player took 501; every reference took 502. This must not be counted as identical —
    // it is the exact case the "any of its talentIds" bug misreported as a match.
    const nodes = [choiceNode(1, [501, 502], ['Savage Fury', 'Predatory Swiftness'])];
    const references = [
      player('Aidan', { 502: 1 }),
      player('Brea', { 502: 1 }),
      player('Cass', { 502: 1 }),
    ];

    const result = diffTalents(nodes, { 501: 1 }, references);

    expect(result.sharedCount).toBe(0);
    expect(result.mineOnly).toEqual([
      { nodeId: 1, label: 'Savage Fury', myRank: 1, referenceCount: 0, referenceTotal: 3 },
    ]);
    expect(result.theirsOnly).toEqual([
      {
        nodeId: 1,
        label: 'Predatory Swiftness',
        myRank: null,
        referenceCount: 3,
        referenceTotal: 3,
      },
    ]);
  });

  it('labels a choice node with the option actually taken, not the first one', () => {
    // The join is by index: `talentIds[i]` must name the same option as `names[i]`. Taking the
    // *second* id is what distinguishes a correct index join from one that always reads
    // `names[0]` — and it is the case the generator's `_Index` ordering exists to guarantee.
    const nodes = [choiceNode(1, [501, 502], ['Savage Fury', 'Predatory Swiftness'])];
    const references = [player('Aidan', { 501: 1 }), player('Brea', { 501: 1 })];

    const result = diffTalents(nodes, { 502: 1 }, references);

    expect(result.mineOnly.map((e) => e.label)).toEqual(['Predatory Swiftness']);
    expect(result.theirsOnly.map((e) => e.label)).toEqual(['Savage Fury']);
  });

  it('falls back to #id when the generator produced a choice node without names', () => {
    // The exact shape 25 generated files carried before the `isChoice` fix: two ids, no name
    // anywhere. `#id` is a legitimate last resort — it must stay, and it must stay per-id, so
    // two unnamed options never collapse onto one label.
    const nodes = [choiceNode(1, [501, 502], ['', ''])];
    const references = [player('Aidan', { 502: 1 }), player('Brea', { 502: 1 })];

    const result = diffTalents(nodes, { 501: 1 }, references);

    expect(result.mineOnly.map((e) => e.label)).toEqual(['#501']);
    expect(result.theirsOnly.map((e) => e.label)).toEqual(['#502']);
  });

  it('counts a choice node as shared only when the taken id actually matches', () => {
    const nodes = [choiceNode(1, [501, 502], ['Savage Fury', 'Predatory Swiftness'])];
    const references = [player('Aidan', { 501: 1 }), player('Brea', { 501: 1 })];

    const result = diffTalents(nodes, { 501: 1 }, references);

    expect(result.sharedCount).toBe(1);
    expect(result.mineOnly).toEqual([]);
    expect(result.theirsOnly).toEqual([]);
  });
});

describe('diffTalents position-duplicate merging', () => {
  it('merges two named nodes at the same position, honoring both talentIds', () => {
    // Both copies sit at spec:0:0 — a reference who only took the second copy's id (202)
    // must still be counted, which fails if the second copy's talentIds are dropped.
    const first: TalentNode = {
      id: 10,
      talentIds: [201],
      name: 'Frenzy',
      names: ['Frenzy'],
      spellId: 10,
      row: 0,
      col: 0,
      maxRanks: 1,
      nodeType: 'single',
      treeType: 'spec',
      children: [],
    };
    const second: TalentNode = {
      id: 11,
      talentIds: [202],
      name: 'Frenzy',
      names: ['Frenzy'],
      spellId: 11,
      row: 0,
      col: 0,
      maxRanks: 1,
      nodeType: 'single',
      treeType: 'spec',
      children: [],
    };
    const references = [player('Dree', { 202: 1 })];

    const result = diffTalents([first, second], {}, references);

    expect(result.theirsOnly.map((e) => [e.label, e.referenceCount])).toEqual([['Frenzy', 1]]);
  });

  it('merges a named and an unnamed node, preferring the named label but keeping both ids', () => {
    const named: TalentNode = {
      id: 20,
      talentIds: [301],
      name: 'Bloodfury',
      names: ['Bloodfury'],
      spellId: 20,
      row: 1,
      col: 0,
      maxRanks: 1,
      nodeType: 'single',
      treeType: 'spec',
      children: [],
    };
    const unnamed: TalentNode = {
      id: 21,
      talentIds: [302],
      name: '',
      names: [],
      spellId: 21,
      row: 1,
      col: 0,
      maxRanks: 1,
      nodeType: 'single',
      treeType: 'spec',
      children: [],
    };
    const references = [player('Elu', { 302: 1 })];

    // Unnamed node listed first so a naive "first wins" implementation would lose the label.
    const result = diffTalents([unnamed, named], {}, references);

    expect(result.theirsOnly.map((e) => [e.label, e.referenceCount])).toEqual([['Bloodfury', 1]]);
  });

  it('does not collapse nodes at the same row/col but different treeType', () => {
    const classNode: TalentNode = {
      id: 30,
      talentIds: [401],
      name: 'Charge',
      names: ['Charge'],
      spellId: 30,
      row: 0,
      col: 0,
      maxRanks: 1,
      nodeType: 'single',
      treeType: 'class',
      children: [],
    };
    const specNode: TalentNode = {
      id: 31,
      talentIds: [402],
      name: 'Bladestorm',
      names: ['Bladestorm'],
      spellId: 31,
      row: 0,
      col: 0,
      maxRanks: 1,
      nodeType: 'single',
      treeType: 'spec',
      children: [],
    };
    const references = [player('Fen', { 401: 1, 402: 1 })];

    const result = diffTalents([classNode, specNode], {}, references);

    expect(result.theirsOnly.map((e) => e.label).sort()).toEqual(['Bladestorm', 'Charge']);
  });
});
