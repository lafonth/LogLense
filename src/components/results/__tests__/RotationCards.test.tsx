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
      opening: [],
    },
    damageTable: { entries: [] },
    provenance: {
      code: `code-${name}`,
      fightID: 1,
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

const MINE: RotationSummary = {
  name: 'Jumbaa',
  fightDurationMs: 263000,
  casts: { 'Ferocious Bite': { casts: 18, perMin: 4.1 } },
  buffs: {},
  opening: [],
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
    expect(screen.queryByTestId('rotation-bar')).not.toBeInTheDocument();
  });

  it('shows a value with no deviation when no reference used the ability', () => {
    const mine: RotationSummary = {
      name: 'Jumbaa',
      fightDurationMs: 263000,
      casts: {
        'Ferocious Bite': { casts: 18, perMin: 4.1 },
        Rip: { casts: 4, perMin: 0.9 },
      },
      buffs: {},
      opening: [],
    };
    const references = [
      reference('Aidan', { 'Ferocious Bite': 6.6 }),
      reference('Brea', { 'Ferocious Bite': 7.2 }),
    ];

    render(<RotationCards character={mine} topPlayers={references} />);

    const ripCard = screen.getByText('Rip').closest('li');
    expect(ripCard).not.toBeNull();
    expect(screen.getByText('0.90')).toBeInTheDocument();
    expect(ripCard).not.toHaveTextContent('%');
    // No reference cast Rip at all — there must be no range band or "references x – y" text,
    // not just no deviation percentage (the cast unit is "/min", so a stray "0.00 – 0.00"
    // range wouldn't have contained a '%' either and would have slipped past that assertion).
    expect(ripCard).not.toHaveTextContent('references');
    expect(ripCard?.querySelector('[data-testid="rotation-bar"]')).toBeNull();
  });

  it('renders a second card for buffs with non-zero uptime', () => {
    const mineWithUptime: RotationSummary = {
      ...MINE,
      buffs: { "Tiger's Fury": 62.4 },
    };
    const referencesWithUptime = [
      reference('Aidan', { 'Ferocious Bite': 6.6 }),
      reference('Brea', { 'Ferocious Bite': 7.2 }),
    ].map((player) => ({
      ...player,
      rotation: { ...player.rotation, buffs: { "Tiger's Fury": 58.1 } },
    }));

    render(<RotationCards character={mineWithUptime} topPlayers={referencesWithUptime} />);

    expect(screen.getByText('Uptime')).toBeInTheDocument();
    expect(screen.getByText("Tiger's Fury")).toBeInTheDocument();
  });

  it('shows no uptime card when the player has no buffs with non-zero uptime', () => {
    render(<RotationCards character={MINE} topPlayers={REFERENCES} />);

    expect(screen.queryByText('Uptime')).not.toBeInTheDocument();
  });
});
