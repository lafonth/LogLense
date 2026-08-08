// src/components/results/__tests__/ComparabilityBanner.test.tsx
import type { Comparability } from '@/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ComparabilityBanner } from '../ComparabilityBanner';

function comparability(over: Partial<Comparability> = {}): Comparability {
  return {
    level: 'close',
    referenceIlvl: 285,
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

  it('signs the item-level gap upward', () => {
    render(
      <ComparabilityBanner
        comparability={comparability({ level: 'poor', referenceIlvl: 292, myIlvl: 284 })}
      />
    );

    expect(screen.getByText(/\+8/)).toBeInTheDocument();
  });

  it('signs the item-level gap downward', () => {
    render(
      <ComparabilityBanner comparability={comparability({ referenceIlvl: 280, myIlvl: 284 })} />
    );

    expect(screen.getByText(/−4/)).toBeInTheDocument();
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

  it('signs the kill-time gap upward when references are slower', () => {
    render(
      <ComparabilityBanner
        comparability={comparability({ referenceKillTimeMs: 330000, myKillTimeMs: 300000 })}
      />
    );

    // (330000 - 300000) / 300000 * 100 = 10.0
    expect(screen.getByText(/\+10%/)).toBeInTheDocument();
  });

  it('signs the kill-time gap downward when references are faster', () => {
    render(
      <ComparabilityBanner
        comparability={comparability({ referenceKillTimeMs: 270000, myKillTimeMs: 300000 })}
      />
    );

    // (270000 - 300000) / 300000 * 100 = -10.0
    expect(screen.getByText(/−10%/)).toBeInTheDocument();
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
