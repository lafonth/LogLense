import type { BossState } from '@/hooks/useAnalysis';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DashboardHeader, LoadingProgress } from '../DashboardHeader';

function renderHeader(over: Partial<Parameters<typeof DashboardHeader>[0]> = {}) {
  return render(
    <DashboardHeader
      title="Jumbaa"
      subtitle="Balance Druid"
      difficulty={5}
      onDifficultyChange={vi.fn()}
      onReset={vi.fn()}
      {...over}
    />
  );
}

describe('dashboardHeader', () => {
  it('marks the difficulty on display, and only that one', () => {
    renderHeader();

    expect(screen.getByRole('button', { name: 'Mythic' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Heroic' })).not.toHaveAttribute('aria-current');
  });

  it('spends nothing when the difficulty already displayed is clicked again', () => {
    const onDifficultyChange = vi.fn();
    renderHeader({ onDifficultyChange });

    screen.getByRole('button', { name: 'Mythic' }).click();

    expect(onDifficultyChange).not.toHaveBeenCalled();
  });

  // Un palier sans kill n'est pas un bouton : il n'y a rien à y aller chercher.
  it('leaves a difficulty with no kill out of the controls', () => {
    renderHeader({ difficulty: 4, availableDifficulties: new Set([4, 3]) });

    expect(screen.queryByRole('button', { name: 'Mythic' })).not.toBeInTheDocument();
    expect(screen.getByText('Mythic')).toBeInTheDocument();
  });
});

const LOADING: BossState = { status: 'loading' };
const DONE: BossState = { status: 'success', result: null };

describe('loadingProgress', () => {
  const encounters = [{ name: 'Chimaerus' }, { name: 'Fractillus' }, { name: 'Nexus-King' }];

  /*
   * La région vive tient sur le seul résumé chiffré. Huit lignes d'étapes qui basculent une à
   * une produiraient huit annonces pour une seule information — l'avancement — et la liste
   * reste donc visible mais hors de la région.
   */
  it('announces the progress as a count, not as a list of steps', () => {
    render(<LoadingProgress encounters={encounters} bossStates={[DONE, LOADING, LOADING]} />);

    expect(screen.getByRole('status')).toHaveTextContent('Fetching bosses… 1 of 3');
  });

  it('counts a failed boss as settled, since nothing more will come of it', () => {
    render(
      <LoadingProgress
        encounters={encounters}
        bossStates={[DONE, { status: 'error', message: 'no ranking' }, LOADING]}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('2 of 3');
  });

  it('says nothing at all once every boss has settled', () => {
    render(<LoadingProgress encounters={encounters} bossStates={[DONE, DONE, DONE]} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
