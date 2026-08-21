import type { TrajectoryPoint } from '@/lib/wcl/trajectory';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TrajectoryChart } from '../TrajectoryChart';

let n = 0;

function point(over: Partial<TrajectoryPoint> = {}): TrajectoryPoint {
  n += 1;
  return {
    at: new Date(Date.UTC(2026, 3, n, 20)).toISOString(),
    dps: 100000,
    rankPercent: 60,
    todayPercent: 55,
    bracket: 280,
    killTimeMs: 300000,
    code: `R${n}`,
    fightID: 1,
    spec: 'Feral',
    analysed: false,
    ...over,
  };
}

function percents(values: number[], over: Partial<TrajectoryPoint> = {}) {
  return values.map((rankPercent) => point({ rankPercent, ...over }));
}

describe('trajectoryChart', () => {
  // Un rapport isolé reste un rapport valide : rien n'est tracé. Mais le bloc ne disparaît
  // plus — un vide se lit comme une panne, alors que le motif est une donnée.
  it('dit pourquoi il ne trace rien plutôt que de disparaître', () => {
    render(<TrajectoryChart trajectory={[]} />);
    expect(screen.getByText(/No ranked kill on this boss yet/)).toBeInTheDocument();

    render(<TrajectoryChart trajectory={[point()]} />);
    expect(screen.getByText(/One ranked kill is not a trajectory/)).toBeInTheDocument();
  });

  // Le motif le moins devinable des trois : les kills existent, mais dans une autre spec.
  it('impute le vide au changement de spec quand c’est lui qui coupe le segment', () => {
    render(
      <TrajectoryChart
        trajectory={[point({ spec: 'Balance' }), point({ spec: 'Balance' }), point()]}
      />
    );

    expect(screen.getByText(/One ranked kill is not a trajectory/)).toHaveTextContent(
      '2 earlier kills are left out'
    );
  });

  it('annonce le plateau, le message que le joueur ne voit pas seul', () => {
    render(<TrajectoryChart trajectory={percents([61, 59, 62, 60, 61])} />);

    expect(screen.getByText('Plateau')).toBeInTheDocument();
  });

  it('trace un point par kill et grossit celui que le rapport analyse', () => {
    const { container } = render(
      <TrajectoryChart trajectory={[point(), point(), point({ analysed: true })]} />
    );

    const circles = container.querySelectorAll('circle');
    expect(circles).toHaveLength(3);
    expect(circles[2].getAttribute('class')).toContain('fill-brass-bright');
    expect(circles[2].getAttribute('r')).not.toBe(circles[0].getAttribute('r'));
  });

  // Le DPS reste en second : c'est lui qui monte tout seul sur un palier.
  it('trace le percentile et laisse le DPS au survol', () => {
    const { container } = render(<TrajectoryChart trajectory={percents([40, 71])} />);

    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Percentile')
    );
    expect(container.querySelector('title')?.textContent).toContain('100,000 dps');
  });

  it("décompose l'écart et dit que c'est une estimation", () => {
    render(
      <TrajectoryChart
        trajectory={[point({ dps: 100000 }), point({ dps: 105000, bracket: 284 })]}
      />
    );

    expect(screen.getByText('+4,000')).toBeInTheDocument();
    expect(screen.getByText('+1,000')).toBeInTheDocument();
    expect(screen.getByText(/estimated, not measured/)).toBeInTheDocument();
  });

  // `encounterRankings` ne classe pas un wipe : sans cette phrase la courbe ment par omission.
  it('dit que la courbe ne contient que des kills', () => {
    render(<TrajectoryChart trajectory={percents([40, 71])} />);

    expect(screen.getByText(/does not rank a wipe/)).toBeInTheDocument();
  });

  it('dit combien de kills un changement de spec laisse dehors', () => {
    render(
      <TrajectoryChart
        trajectory={[
          ...percents([10, 20], { spec: 'Balance' }),
          ...percents([60, 61], { spec: 'Feral' }),
        ]}
      />
    );

    expect(screen.getByText(/left out/)).toBeInTheDocument();
    expect(screen.getByText('Feral')).toBeInTheDocument();
  });
});
