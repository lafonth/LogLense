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
    rotation: { name, fightDurationMs: 263000, casts: {}, buffs: {} },
    damageTable: { entries: [] },
  };
}

const NODES = [node(1, [101], 'Sabertooth'), node(2, [102], 'Veinripper'), node(3, [103], 'Rip')];
const REFERENCES = [player('Aidan', { 102: 3, 103: 1 }), player('Brea', { 102: 3, 103: 1 })];

describe('talentDiff', () => {
  it('shows both difference groups and hides the shared nodes behind a count', () => {
    render(<TalentDiff nodes={NODES} myTalents={{ 101: 1, 103: 1 }} topPlayers={REFERENCES} />);

    expect(screen.getByText('Sabertooth')).toBeInTheDocument();
    expect(screen.getByText('Veinripper')).toBeInTheDocument();
    expect(screen.getByText(/1 identical node/)).toBeInTheDocument();
  });

  it('shows how many references took each of their talents', () => {
    render(<TalentDiff nodes={NODES} myTalents={{ 101: 1, 103: 1 }} topPlayers={REFERENCES} />);

    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('says so when there is nothing to compare against', () => {
    render(<TalentDiff nodes={NODES} myTalents={{ 101: 1 }} topPlayers={[]} />);

    expect(screen.getByText(/No comparable logs/)).toBeInTheDocument();
    expect(screen.queryByText('2 / 2')).not.toBeInTheDocument();
  });

  it('reports an identical build rather than showing empty groups', () => {
    render(<TalentDiff nodes={NODES} myTalents={{ 102: 3, 103: 1 }} topPlayers={REFERENCES} />);

    expect(screen.getByText(/Identical build/)).toBeInTheDocument();
  });
});
