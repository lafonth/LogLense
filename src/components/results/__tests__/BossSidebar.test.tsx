import type { BossState } from '@/hooks/useAnalysis';
import type { Encounter } from '@/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BossSidebar } from '../BossSidebar';

const encounters: Encounter[] = [
  { id: 1, name: 'Chimaerus' },
  { id: 2, name: 'Fractillus' },
];

function ok(pct: number): BossState {
  return { status: 'success', result: { character: { overallPct: pct } } } as BossState;
}

const failed: BossState = { status: 'error', message: 'Network error' };

/**
 * `activeIdx` reste sur Chimaerus : le déclencheur mobile de `Sheet` porte le nom du boss
 * actif, donc c'est le seul nom qui apparaisse deux fois. Les assertions visent Fractillus.
 */
function renderSidebar(bossStates: BossState[]) {
  const onSelect = vi.fn();
  render(
    <BossSidebar
      encounters={encounters}
      bossStates={bossStates}
      activeIdx={0}
      onSelect={onSelect}
    />
  );
  return onSelect;
}

describe('bossSidebar', () => {
  it('says a boss failed in words, not in an abbreviation', () => {
    // `err` ne disait ni ce qui a échoué ni qu'on pouvait y revenir.
    renderSidebar([ok(90), failed]);

    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(screen.queryByText('err')).not.toBeInTheDocument();
  });

  // Le rail large de 200 px n'a pas la place du message : il porte l'état, la reprise est
  // dans le panneau — un clic sur la ligne suffit à l'atteindre.
  it('keeps a failed boss selectable, so its panel can be reached', async () => {
    const user = userEvent.setup();
    const onSelect = renderSidebar([ok(90), failed]);

    await user.click(screen.getByRole('button', { name: /^Fractillus/ }));

    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
