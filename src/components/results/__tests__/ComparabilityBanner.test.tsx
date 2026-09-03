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
    poolDps: null,
    poolIlvl: null,
    poolIlvlCount: 0,
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

// D'où sort le vivier n'est pas déductible de l'écran : la couverture en brackets peut être
// abandonnée faute de découpage exploitable, et le plancher peut la relâcher après coup.
describe('comparabilityBanner, provenance du vivier', () => {
  it('says how narrow the pool was drawn around the player', () => {
    render(
      <ComparabilityBanner
        comparability={comparability({
          poolFilters: { brackets: [15, 16, 17], externalBuffs: 'Any', relaxed: false },
        })}
      />
    );

    expect(screen.getByText(/item level brackets around yours/)).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('says when the field was purged of external carriers', () => {
    render(
      <ComparabilityBanner
        comparability={comparability({
          poolFilters: { brackets: [15, 16], externalBuffs: 'Exclude', relaxed: false },
        })}
      />
    );

    expect(screen.getByText(/handed an offensive external/)).toBeInTheDocument();
  });

  // Un vivier élargi en silence n'est plus celui que la bannière décrit : le repli se dénonce.
  it('says when the filtered pool was too thin and had to be widened', () => {
    render(
      <ComparabilityBanner
        comparability={comparability({
          poolFilters: { brackets: [15, 16, 17], externalBuffs: 'Any', relaxed: true },
        })}
      />
    );

    expect(screen.getByText(/widened back to the full rankings/)).toBeInTheDocument();
  });

  // Les instantanés de 24 h écrits avant le filtrage à la source rejouent sans ce champ.
  it('says nothing about the pool when the snapshot predates the filters', () => {
    render(<ComparabilityBanner comparability={comparability()} />);

    expect(screen.queryByText(/item level brackets around yours/)).not.toBeInTheDocument();
    expect(screen.queryByText(/widened back/)).not.toBeInTheDocument();
  });

  it('says nothing about a pool the tier would not let it narrow', () => {
    render(
      <ComparabilityBanner
        comparability={comparability({
          poolFilters: { brackets: [], externalBuffs: 'Any', relaxed: false },
        })}
      />
    );

    expect(screen.queryByText(/item level brackets around yours/)).not.toBeInTheDocument();
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
