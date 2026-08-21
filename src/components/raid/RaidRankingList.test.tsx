import type { RaidRanking } from '@/lib/wcl/raid-ranking';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RaidRankingList } from './RaidRankingList';

function ranking(over: Partial<RaidRanking> = {}): RaidRanking {
  return {
    code: 'abcdefgh12345678',
    fightID: 42,
    encounterID: 2677,
    encounterName: 'Fyrakk the Blazing',
    difficulty: 5,
    kill: true,
    fightMs: 300_000,
    criterion: 'percentile',
    criterionReason: 'Ranked by percentile: every DPS on this pull has one.',
    players: [
      {
        actorId: 1,
        name: 'Arms',
        specId: 71,
        specName: 'Arms',
        className: 'Warrior',
        dps: 1000,
        percentile: 42.7,
        tierPieces: 2,
      },
      {
        actorId: 2,
        name: 'Fury',
        specId: 72,
        specName: 'Fury',
        className: 'Warrior',
        dps: 2000,
        percentile: 91.2,
        tierPieces: null,
      },
    ],
    ...over,
  };
}

describe('le raid trié à l’écran', () => {
  it('nomme l’axe du tri — jamais un classement dont on ignore l’axe', () => {
    render(<RaidRankingList ranking={ranking()} onOpen={vi.fn()} />);

    expect(screen.getByText(/Ranked by percentile/)).toBeInTheDocument();
  });

  it('annonce le repli DPS plutôt que de le passer pour un percentile', () => {
    render(
      <RaidRankingList
        ranking={ranking({
          criterion: 'dps',
          criterionReason: 'Ranked by raw DPS: 1 player of this pull has no WCL ranking entry.',
        })}
        onOpen={vi.fn()}
      />
    );

    expect(screen.getByText(/raw DPS/)).toBeInTheDocument();
    // La colonne de droite bascule avec l'axe : c'est le DPS qui porte le tri.
    expect(screen.getByText('1.0k')).toBeInTheDocument();
  });

  it('ouvre le joueur cliqué, celui du classement et pas un autre', () => {
    const onOpen = vi.fn();
    render(<RaidRankingList ranking={ranking()} onOpen={onOpen} />);

    fireEvent.click(screen.getByText('Fury').closest('button')!);

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ actorId: 2, name: 'Fury' }));
  });

  it('trie du plus de marge au moins, et le rend lisible', () => {
    render(<RaidRankingList ranking={ranking()} onOpen={vi.fn()} />);

    const rows = screen.getAllByRole('button');
    expect(rows[0]).toHaveTextContent('Arms');
    expect(rows[0]).toHaveTextContent('2p tier');
    expect(rows[1]).toHaveTextContent('Fury');
  });
});
