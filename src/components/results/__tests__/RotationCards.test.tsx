import type { RotationSummary, TopPlayer } from '@/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RotationCards } from '../RotationCards';

function reference(name: string, perMin: Record<string, number>): TopPlayer {
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
      buffs: {},
    },
    damageTable: { entries: [] },
  };
}

const MINE: RotationSummary = {
  name: 'Jumbaa',
  fightDurationMs: 263000,
  casts: { 'Ferocious Bite': { casts: 18, perMin: 4.1 } },
  buffs: {},
};

const REFERENCES = [
  reference('Aidan', { 'Ferocious Bite': 6.6 }),
  reference('Brea', { 'Ferocious Bite': 7.2 }),
];

describe('rotationCards', () => {
  it('shows the ability, the player value and the reference range', () => {
    render(<RotationCards character={MINE} topPlayers={REFERENCES} />);

    expect(screen.getByText('Ferocious Bite')).toBeInTheDocument();
    expect(screen.getByText('4.10')).toBeInTheDocument();
    expect(screen.getByText(/6\.60.*7\.20/)).toBeInTheDocument();
  });

  it('renders the deviation with a sign', () => {
    render(<RotationCards character={MINE} topPlayers={REFERENCES} />);

    expect(screen.getByText('−40.6 %')).toBeInTheDocument();
  });

  it('shows player values alone when there is nothing to compare against', () => {
    render(<RotationCards character={MINE} topPlayers={[]} />);

    expect(screen.getByText('4.10')).toBeInTheDocument();
    expect(screen.getByText(/No comparable logs/)).toBeInTheDocument();
  });
});
