import type { CharacterStats, ReferenceSample } from '@/types';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatsTable } from '../StatsTable';

function stats(over: Partial<CharacterStats> = {}): CharacterStats {
  return {
    name: 'Jumbaa',
    avgIlvl: 635,
    primaryStat: 13200,
    crit: 3890,
    haste: 3500,
    mastery: 5800,
    vers: 750,
    talents: {},
    ...over,
  };
}

function sample(name: string, over: Partial<CharacterStats>, qualified = true): ReferenceSample {
  return {
    name,
    code: 'abc',
    fightID: 1,
    actorId: 1,
    stats: stats({ name, ...over }),
    dps: 250000,
    killTimeMs: 180000,
    qualified,
    explored: false,
  };
}

/** La ligne d'une stat, pour lire ses colonnes sans dépendre de l'ordre du tableau. */
function row(label: string) {
  return screen.getByRole('cell', { name: label }).closest('tr')!;
}

describe('statsTable', () => {
  it('renders the player alone when no reference could be gathered', () => {
    render(<StatsTable character={stats()} sample={[]} />);

    expect(screen.getByRole('columnheader', { name: 'You' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Refs median' })).not.toBeInTheDocument();
    expect(within(row('Avg ilvl')).getByText('635.0')).toBeInTheDocument();
  });

  it('states the distribution over the references once there are some', () => {
    render(
      <StatsTable
        character={stats()}
        sample={[
          sample('A', { avgIlvl: 630 }),
          sample('B', { avgIlvl: 640 }),
          sample('C', { avgIlvl: 650 }),
        ]}
      />
    );

    const ilvl = within(row('Avg ilvl'));
    expect(ilvl.getByText('630.0')).toBeInTheDocument();
    expect(ilvl.getByText('640.0')).toBeInTheDocument();
    expect(ilvl.getByText('650.0')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('measures the gap against the median, not the mean', () => {
    // Moyenne 700, médiane 640 : les deux chiffres diffèrent assez pour qu'aucun hasard
    // ne fasse passer le test si le composant changeait de repère.
    render(
      <StatsTable
        character={stats({ avgIlvl: 635 })}
        sample={[
          sample('A', { avgIlvl: 630 }),
          sample('B', { avgIlvl: 640 }),
          sample('C', { avgIlvl: 830 }),
        ]}
      />
    );

    expect(within(row('Avg ilvl')).getByText(/−5\.0/)).toBeInTheDocument();
  });

  it('marks a gap below the references without calling it an error', () => {
    const { container } = render(
      <StatsTable character={stats({ avgIlvl: 600 })} sample={[sample('A', { avgIlvl: 640 })]} />
    );

    // Le rouge reste réservé aux comparaisons illégitimes : un écart se dit en bleu.
    expect(container.querySelector('.text-deviation')).not.toBeNull();
    expect(within(row('Avg ilvl')).queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it('places the player in the distribution rather than only above or below it', () => {
    render(
      <StatsTable
        character={stats({ avgIlvl: 640 })}
        sample={[
          sample('A', { avgIlvl: 630 }),
          sample('B', { avgIlvl: 640 }),
          sample('C', { avgIlvl: 650 }),
        ]}
      />
    );

    // Au centre exact : les ex æquo comptent pour moitié, donc p50 et pas p33 ni p67.
    expect(within(row('Avg ilvl')).getByText('p50')).toBeInTheDocument();
  });

  it('ignores the disqualified references while some qualified ones remain', () => {
    render(
      <StatsTable
        character={stats()}
        sample={[sample('Qualified', { avgIlvl: 640 }), sample('Boosted', { avgIlvl: 800 }, false)]}
      />
    );

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(within(row('Avg ilvl')).queryByText('800.0')).not.toBeInTheDocument();
  });

  it('says outright that the field is not comparable when nothing qualified', () => {
    render(
      <StatsTable character={stats()} sample={[sample('Boosted', { avgIlvl: 800 }, false)]} />
    );

    // Le repli est admis, jamais silencieux — et c'est le seul cas où le rouge est légitime.
    const warning = screen.getByText(/not comparable/i);
    expect(warning).toBeInTheDocument();
    expect(warning).toHaveClass('text-danger');
  });

  it('does not warn when the distribution rests on qualified references', () => {
    render(<StatsTable character={stats()} sample={[sample('A', { avgIlvl: 640 })]} />);

    expect(screen.queryByText(/not comparable/i)).not.toBeInTheDocument();
  });

  it('keeps every stat axis, so a missing line means missing data', () => {
    render(<StatsTable character={stats()} sample={[sample('A', {})]} />);

    for (const label of ['Avg ilvl', 'Primary Stat', 'Crit', 'Haste', 'Mastery', 'Versatility']) {
      expect(screen.getByRole('cell', { name: label })).toBeInTheDocument();
    }
  });

  it('groups the thousands of a rating, and keeps ilvl to a tenth', () => {
    render(<StatsTable character={stats({ crit: 3890.6, avgIlvl: 634.46 })} sample={[]} />);

    expect(within(row('Crit')).getByText('3,891')).toBeInTheDocument();
    expect(within(row('Avg ilvl')).getByText('634.5')).toBeInTheDocument();
  });
});
