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
});
