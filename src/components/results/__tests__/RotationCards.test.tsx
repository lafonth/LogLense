import type { RotationSummary, TopPlayer } from '@/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RotationCards } from '../RotationCards';

/** Les fixtures portent le vrai id : c'est par lui que casts et dégâts se joignent. */
const GUIDS: Record<string, number> = { 'Ferocious Bite': 22568, Rip: 1079 };

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
        Object.entries(perMin).map(([k, v]) => [
          k,
          { guid: GUIDS[k] ?? 0, casts: Math.round(v * 4), perMin: v },
        ])
      ),
      buffs: {},
      opening: [],
    },
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

const MINE: RotationSummary = {
  name: 'Jumbaa',
  fightDurationMs: 263000,
  casts: { 'Ferocious Bite': { guid: 22568, casts: 18, perMin: 4.1 } },
  buffs: {},
  opening: [],
};

const REFERENCES = [
  reference('Aidan', { 'Ferocious Bite': 6.6 }),
  reference('Brea', { 'Ferocious Bite': 7.2 }),
];

describe('rotationCards', () => {
  it('shows the ability, the player value and the reference range', () => {
    render(<RotationCards character={MINE} topPlayers={REFERENCES} characterDamage={[]} />);

    expect(screen.getByText('Ferocious Bite')).toBeInTheDocument();
    expect(screen.getByText('4.10')).toBeInTheDocument();
    expect(screen.getByText(/6\.60.*7\.20/)).toBeInTheDocument();
  });

  it('renders the deviation with a sign', () => {
    render(<RotationCards character={MINE} topPlayers={REFERENCES} characterDamage={[]} />);

    expect(screen.getByText('−40.6 %')).toBeInTheDocument();
  });

  it('shows player values alone when there is nothing to compare against', () => {
    render(<RotationCards character={MINE} topPlayers={[]} characterDamage={[]} />);

    expect(screen.getByText('4.10')).toBeInTheDocument();
    expect(screen.getByText(/No comparable logs/)).toBeInTheDocument();
    expect(screen.queryByTestId('rotation-bar')).not.toBeInTheDocument();
  });

  it('shows a value with no deviation when no reference used the ability', () => {
    const mine: RotationSummary = {
      name: 'Jumbaa',
      fightDurationMs: 263000,
      casts: {
        'Ferocious Bite': { guid: 22568, casts: 18, perMin: 4.1 },
        Rip: { guid: 1079, casts: 4, perMin: 0.9 },
      },
      buffs: {},
      opening: [],
    };
    const references = [
      reference('Aidan', { 'Ferocious Bite': 6.6 }),
      reference('Brea', { 'Ferocious Bite': 7.2 }),
    ];

    render(<RotationCards character={mine} topPlayers={references} characterDamage={[]} />);

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

  // L'ordre change quand une table de dégâts est fournie : le dire, sinon la liste est
  // réordonnée sans raison visible.
  it('announces the cost ordering and shows the share that drives it', () => {
    render(
      <RotationCards
        character={MINE}
        topPlayers={REFERENCES}
        characterDamage={[{ guid: 22568, name: 'Ferocious Bite', total: 1000 }]}
      />
    );

    expect(screen.getByText('Rotation · by cost')).toBeInTheDocument();
    expect(screen.getByText('100.0 %')).toBeInTheDocument();
  });

  it('announces the deviation ordering when no damage table is available', () => {
    render(<RotationCards character={MINE} topPlayers={REFERENCES} characterDamage={[]} />);

    expect(screen.getByText('Rotation · by deviation')).toBeInTheDocument();
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

    render(
      <RotationCards
        character={mineWithUptime}
        topPlayers={referencesWithUptime}
        characterDamage={[]}
      />
    );

    expect(screen.getByText('Uptime')).toBeInTheDocument();
    expect(screen.getByText("Tiger's Fury")).toBeInTheDocument();
  });

  // Le regroupement ne prétend pas séparer défensifs et utilitaires — aucune donnée WCL ne
  // porte cette distinction. Il dit seulement ce qui est mesuré : porter des dégâts ou non.
  it('groups the casts by whether they deal damage', () => {
    const mine: RotationSummary = {
      ...MINE,
      casts: {
        ...MINE.casts,
        Barkskin: { guid: 22812, casts: 2, perMin: 0.5 },
      },
    };

    render(
      <RotationCards
        character={mine}
        topPlayers={REFERENCES}
        characterDamage={[{ guid: 22568, name: 'Ferocious Bite', total: 1000 }]}
      />
    );

    expect(screen.getByText('Damaging')).toBeInTheDocument();
    expect(screen.getByText('Non-damaging')).toBeInTheDocument();
  });

  it('leaves the casts ungrouped when no damage table drove the ordering', () => {
    render(<RotationCards character={MINE} topPlayers={REFERENCES} characterDamage={[]} />);

    expect(screen.queryByText('Damaging')).not.toBeInTheDocument();
    expect(screen.queryByText('Non-damaging')).not.toBeInTheDocument();
  });

  it('splits uptimes between cast auras and procs', () => {
    const mine: RotationSummary = {
      ...MINE,
      buffs: { Rip: 88.2, Bloodtalons: 74.1 },
      casts: { ...MINE.casts, Rip: { guid: 1079, casts: 4, perMin: 0.9 } },
    };
    const references = REFERENCES.map((player) => ({
      ...player,
      rotation: { ...player.rotation, buffs: { Rip: 91.0, Bloodtalons: 80.3 } },
    }));

    render(<RotationCards character={mine} topPlayers={references} characterDamage={[]} />);

    expect(screen.getByText('From your casts')).toBeInTheDocument();
    expect(screen.getByText('Procs and passives')).toBeInTheDocument();
  });

  it('shows no uptime card when the player has no buffs with non-zero uptime', () => {
    render(<RotationCards character={MINE} topPlayers={REFERENCES} characterDamage={[]} />);

    expect(screen.queryByText('Uptime')).not.toBeInTheDocument();
  });
});
