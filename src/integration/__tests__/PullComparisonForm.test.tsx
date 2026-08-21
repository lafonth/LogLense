import type { ReportActor, ReportFight, ReportMeta } from '@/types';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PullComparisonForm } from '@/components/forms/PullComparisonForm';

const actors: ReportActor[] = [
  { id: 7, name: 'Jumbaa', type: 'Player', subType: 'Druid', server: 'Ysondre' },
  { id: 9, name: 'Zorak', type: 'Player', subType: 'Druid', server: 'Ysondre' },
];

function fight(id: number, endTime: number): ReportFight {
  return {
    id,
    name: 'Gallywix',
    encounterID: 100,
    kill: true,
    startTime: 0,
    endTime,
    difficulty: 5,
  };
}

const meta: ReportMeta = {
  title: 'Weekly Mythic Run',
  actors,
  fights: [fight(1, 300000), fight(2, 280000)],
};

/** Charge le rapport d'un côté et rend ses deux sélecteurs. */
async function loadSide(user: ReturnType<typeof userEvent.setup>, label: string) {
  const side = screen.getByRole('heading', { name: label }).parentElement!;
  await user.type(within(side).getByLabelText(/Report Code/i), 'abc1234567890def');
  await user.click(within(side).getByRole('button', { name: /load report/i }));
  await waitFor(() => expect(within(side).getByText('Weekly Mythic Run')).toBeInTheDocument());
  return side;
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(meta) } as Response)
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pullComparisonForm integration', () => {
  it('keeps the chosen pull when the character is picked again', async () => {
    // La liste des pulls ne dépend pas du personnage : vider la sélection laissait le côté
    // non résolu sans que rien ne le dise, sur un champ qui paraissait rempli.
    const user = userEvent.setup();
    render(<PullComparisonForm onSubmit={vi.fn()} loading={false} onBack={vi.fn()} />);
    const side = await loadSide(user, 'Before');

    await user.selectOptions(within(side).getByLabelText('Character'), '7');
    await user.selectOptions(within(side).getByLabelText('Pull'), '2');
    await user.selectOptions(within(side).getByLabelText('Character'), '9');

    expect(within(side).getByLabelText('Pull')).toHaveValue('2');
  });

  it('resolves the side again on the new character, without a second pull click', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<PullComparisonForm onSubmit={onSubmit} loading={false} onBack={vi.fn()} />);

    for (const label of ['Before', 'After']) {
      const side = await loadSide(user, label);
      await user.selectOptions(within(side).getByLabelText('Character'), '7');
      await user.selectOptions(within(side).getByLabelText('Pull'), '1');
    }
    const before = screen.getByRole('heading', { name: 'Before' }).parentElement!;
    await user.selectOptions(within(before).getByLabelText('Character'), '9');

    // Le bouton restait éteint : le côté était retombé à `null` sans que l'écran le dise.
    const compare = screen.getByRole('button', { name: 'Compare' });
    expect(compare).toBeEnabled();
    await user.click(compare);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 9 }),
      expect.objectContaining({ actorId: 7 }),
      expect.any(Number)
    );
  });
});
