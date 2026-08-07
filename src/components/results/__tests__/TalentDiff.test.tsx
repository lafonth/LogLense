import type { TalentNode, TopPlayer } from '@/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TalentDiff } from '../TalentDiff';

function node(id: number, talentIds: number[], name: string): TalentNode {
  return {
    id,
    talentIds,
    name,
    names: [name],
    spellId: id,
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
    },
  };
}

const NODES = [node(1, [101], 'Sabertooth'), node(2, [102], 'Veinripper'), node(3, [103], 'Rip')];
const REFERENCES = [player('Aidan', { 102: 3, 103: 1 }), player('Brea', { 102: 3, 103: 1 })];

/**
 * The hidden-nodes count renders its numeral in a nested `font-mono` span (see TalentDiff),
 * so the surrounding sentence is split across sibling text nodes and elements. Testing
 * Library's plain string/regex `getByText` only reads an element's own direct text-node
 * children (see `getNodeText`), so it can't see text split by a nested element. This matcher
 * checks the full rendered text instead, picking the innermost element that contains it.
 */
function textMatch(regex: RegExp) {
  return (_content: string, element: Element | null) => {
    if (!element) return false;
    const hasText = (el: Element) => regex.test(el.textContent ?? '');
    return hasText(element) && Array.from(element.children).every((child) => !hasText(child));
  };
}

describe('talentDiff', () => {
  it('shows both difference groups and hides the shared nodes behind a count', () => {
    render(<TalentDiff nodes={NODES} myTalents={{ 101: 1, 103: 1 }} references={REFERENCES} />);

    expect(screen.getByText('Sabertooth')).toBeInTheDocument();
    expect(screen.getByText('Veinripper')).toBeInTheDocument();
    expect(screen.getByText(textMatch(/1 identical node/))).toBeInTheDocument();
  });

  it('shows how many references took each of their talents', () => {
    render(<TalentDiff nodes={NODES} myTalents={{ 101: 1, 103: 1 }} references={REFERENCES} />);

    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('says so when there is nothing to compare against', () => {
    render(<TalentDiff nodes={NODES} myTalents={{ 101: 1 }} references={[]} />);

    expect(screen.getByText(/No comparable logs/)).toBeInTheDocument();
    expect(screen.queryByText('2 / 2')).not.toBeInTheDocument();
  });

  it('reports an identical build rather than showing empty groups', () => {
    render(<TalentDiff nodes={NODES} myTalents={{ 102: 3, 103: 1 }} references={REFERENCES} />);

    expect(screen.getByText(/Identical build/)).toBeInTheDocument();
  });

  it('pluralises the hidden-nodes count when more than one node is identical', () => {
    const nodes = [
      node(1, [101], 'Sabertooth'),
      node(2, [102], 'Veinripper'),
      node(3, [103], 'Rip'),
      node(4, [104], 'Ambush'),
    ];
    const references = [
      player('Aidan', { 102: 3, 103: 1, 104: 2 }),
      player('Brea', { 102: 3, 103: 1, 104: 2 }),
    ];

    render(
      <TalentDiff nodes={nodes} myTalents={{ 101: 1, 103: 1, 104: 2 }} references={references} />
    );

    expect(screen.getByText(textMatch(/2 identical nodes/))).toBeInTheDocument();
  });

  it('shows only the non-empty group when one side of the diff has no entries', () => {
    render(<TalentDiff nodes={NODES} myTalents={{ 102: 3 }} references={REFERENCES} />);

    expect(screen.queryByText(/You only/)).not.toBeInTheDocument();
    expect(screen.getByText(/References only/)).toBeInTheDocument();
    expect(screen.getByText('Rip')).toBeInTheDocument();
  });
});
