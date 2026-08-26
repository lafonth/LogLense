// src/components/results/__tests__/ComparabilityBanner.test.tsx
import type { Comparability } from '@/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ComparabilityBanner } from '../ComparabilityBanner';

function comparability(over: Partial<Comparability> = {}): Comparability {
  return {
    level: 'close',
    referenceIlvl: 285,
    referenceIlvlCount: 3,
    myIlvl: 284,
    referenceKillTimeMs: 305000,
    myKillTimeMs: 300000,
    candidatesConsidered: 942,
    pagesFetched: 10,
    disqualified: 0,
    unverifiable: 0,
    substituted: 0,
    ...over,
  };
}

describe('comparabilityBanner', () => {
  it('states a close comparison without red', () => {
    const { container } = render(<ComparabilityBanner comparability={comparability()} />);

    expect(screen.getByText(/Comparable/i)).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('text-danger');
  });

  // `VerdictBanner`, juste au-dessus des onglets, énonce déjà l'écart d'ilvl, celui de kill
  // time et l'effectif du panel. Les redire ici, à quelques centimètres, faisait lire deux
  // fois la même arithmétique avant la moindre donnée. Le test porte donc sur l'absence :
  // c'est elle qui se casse silencieusement si quelqu'un réintroduit le paragraphe.
  it('restates neither the item level nor the kill time', () => {
    const { container } = render(
      <ComparabilityBanner
        comparability={comparability({
          referenceIlvl: 292,
          myIlvl: 284,
          referenceKillTimeMs: 330000,
          myKillTimeMs: 300000,
        })}
      />
    );

    const text = container.textContent ?? '';
    expect(text).not.toMatch(/item level/i);
    expect(text).not.toMatch(/kill/i);
    // Ni les chiffres eux-mêmes, sous quelque signe que ce soit.
    expect(text).not.toMatch(/284|292|\+8|\+10%/);
  });

  it('marks a poor comparison in red', () => {
    const { container } = render(
      <ComparabilityBanner comparability={comparability({ level: 'poor' })} />
    );

    expect(container.innerHTML).toContain('text-danger');
  });

  it('says plainly when there is nothing to compare against', () => {
    render(
      <ComparabilityBanner
        comparability={comparability({
          level: 'none',
          referenceIlvl: null,
          referenceKillTimeMs: null,
        })}
      />
    );

    expect(screen.getByText(/No comparable logs/i)).toBeInTheDocument();
  });

  it('reports how wide a net was cast', () => {
    render(<ComparabilityBanner comparability={comparability()} />);

    expect(screen.getByText(/942/)).toBeInTheDocument();
  });

  it('counts what the eliminatory criteria removed', () => {
    render(<ComparabilityBanner comparability={comparability({ disqualified: 7 })} />);

    expect(screen.getByText(/eliminated on set bonus or externals/)).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  // Un panel réduit par un rapport privé n'est pas un panel réduit par les critères : le
  // premier se retente plus tard, le second dit quelque chose du jeu.
  it('separates the candidates it could not read from the ones it eliminated', () => {
    render(<ComparabilityBanner comparability={comparability({ unverifiable: 4 })} />);

    expect(screen.getByText(/unreadable/)).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('stays silent when every candidate could be read', () => {
    render(<ComparabilityBanner comparability={comparability()} />);

    expect(screen.queryByText(/unreadable/)).not.toBeInTheDocument();
  });

  // Le panneau complété reste un repli : il doit se dénoncer, pas se faire passer pour un choix.
  it('says out loud when the panel was completed with references that did not qualify', () => {
    render(
      <ComparabilityBanner comparability={comparability({ level: 'poor', substituted: 2 })} />
    );

    expect(screen.getByText(/Not enough comparable logs/)).toBeInTheDocument();
    expect(
      screen.getByText(/what they gained from it is not something you can play for/)
    ).toBeInTheDocument();
  });

  it('stays silent about substitution when every reference qualified', () => {
    render(<ComparabilityBanner comparability={comparability()} />);

    expect(screen.queryByText(/Not enough comparable logs/)).not.toBeInTheDocument();
  });
});

describe('comparabilityBanner, mort précoce', () => {
  it('says the comparison is hard to defend, in the colour reserved for that', () => {
    const { container } = render(
      <ComparabilityBanner comparability={comparability()} earlyDeathPct={62} />
    );

    expect(screen.getByText(/hard to defend/i)).toBeInTheDocument();
    expect(screen.getByText('62%')).toBeInTheDocument();
    expect(container.innerHTML).toContain('text-danger');
  });

  it('says nothing at all when the share was not established', () => {
    render(<ComparabilityBanner comparability={comparability()} earlyDeathPct={null} />);

    expect(screen.queryByText(/hard to defend/i)).not.toBeInTheDocument();
  });

  it('never advises: it states the coverage and stops there', () => {
    render(<ComparabilityBanner comparability={comparability()} earlyDeathPct={40} />);

    const warning = screen.getByText(/hard to defend/i).textContent ?? '';
    expect(warning).not.toMatch(/defensive|survive|died because|avoid/i);
  });
});
