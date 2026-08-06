import type { OpeningSource } from '@/lib/comparison/opening-diff';
import type { OpeningCast } from '@/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OpeningChain } from '../OpeningChain';

function opening(names: string[]): OpeningCast[] {
  return names.map((name, i) => ({ guid: i + 1, name, offsetMs: i * 1500 }));
}

function reference(names: string[]): OpeningSource {
  return { rotation: { opening: opening(names) } };
}

const THEIRS = [
  reference(["Tiger's Fury", 'Shred', 'Rip']),
  reference(["Tiger's Fury", 'Shred', 'Rip']),
];

describe('openingChain', () => {
  it('says the opening cannot be read rather than showing an empty sequence', () => {
    render(<OpeningChain mine={[]} references={[]} />);

    expect(screen.getByText(/cannot be read/i)).toBeInTheDocument();
  });

  it('shows my sequence alone when no reference carries an opening', () => {
    render(
      <OpeningChain mine={opening(['Shred', 'Rip'])} references={[{ rotation: { opening: [] } }]} />
    );

    expect(screen.getByText(/showing your sequence only/i)).toBeInTheDocument();
    expect(screen.getByText('Shred')).toBeInTheDocument();
  });

  it('names the rank of the first divergence', () => {
    render(<OpeningChain mine={opening(["Tiger's Fury", 'Rip', 'Shred'])} references={THEIRS} />);

    // Le rang annoncé est celui du premier écart, pas de tous ceux qu'il décale ensuite.
    expect(screen.getByText(/You diverge from the references at cast/i).textContent).toContain('2');
  });

  it('confirms a matching opening instead of inventing a fault', () => {
    render(<OpeningChain mine={opening(["Tiger's Fury", 'Shred', 'Rip'])} references={THEIRS} />);

    expect(
      screen.getByText(/follow the reference opening all the way through/i)
    ).toBeInTheDocument();
  });

  it('shows the offset from my first cast and how many references agree', () => {
    render(<OpeningChain mine={opening(["Tiger's Fury", 'Shred'])} references={THEIRS} />);

    expect(screen.getByText('+1.5s')).toBeInTheDocument();
    expect(screen.getAllByText('2 / 2').length).toBeGreaterThan(0);
  });
});
