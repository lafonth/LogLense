import type { BossResult } from '@/types';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportFeedback } from '../ReportFeedback';

/**
 * Seuls les champs que le composant relit comptent ici : le reste du `BossResult` ne
 * traverse pas la soumission.
 */
const boss = {
  renderId: 'render-1',
  encounterId: 3306,
  difficulty: 5,
  specId: 258,
} as BossResult;

function mockFetchOk() {
  return vi.fn().mockResolvedValue({ ok: true } as Response);
}

/** Le corps de la soumission, tel que `/api/labels/report` le recevra. */
function sentBody(): Record<string, unknown> {
  const call = vi.mocked(fetch).mock.calls[0];
  return JSON.parse((call[1] as RequestInit).body as string) as Record<string, unknown>;
}

describe('reportFeedback', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetchOk());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('attaches the verdict to the render that provoked it', async () => {
    const user = userEvent.setup();
    render(<ReportFeedback boss={boss} />);

    await user.click(screen.getByRole('button', { name: 'Useful' }));

    expect(sentBody()).toEqual({
      renderId: 'render-1',
      verdict: 'useful',
      uselessAxes: [],
      encounterId: 3306,
      difficulty: 5,
      specId: 258,
    });
  });

  it('records a negative verdict under its own name', async () => {
    const user = userEvent.setup();
    render(<ReportFeedback boss={boss} />);

    await user.click(screen.getByRole('button', { name: 'Not useful' }));

    expect(sentBody()).toMatchObject({ verdict: 'useless' });
  });

  it('carries the flagged axes in the prompt vocabulary', async () => {
    const user = userEvent.setup();
    render(<ReportFeedback boss={boss} />);

    await user.click(screen.getByRole('button', { name: 'Flag a section' }));
    await user.click(screen.getByRole('button', { name: 'Talents' }));
    await user.click(screen.getByRole('button', { name: 'Opening' }));
    await user.click(screen.getByRole('button', { name: 'Not useful' }));

    // L'ordre est celui des clics, pas celui de `PROMPT_AXES` : le corpus reçoit un ensemble,
    // rien en aval ne lit la position.
    expect(sentBody().uselessAxes).toEqual(['talents', 'opening']);
  });

  it('lets a mis-clicked axis be taken back before sending', async () => {
    const user = userEvent.setup();
    render(<ReportFeedback boss={boss} />);

    await user.click(screen.getByRole('button', { name: 'Flag a section' }));
    await user.click(screen.getByRole('button', { name: 'Talents' }));
    await user.click(screen.getByRole('button', { name: 'Talents' }));
    await user.click(screen.getByRole('button', { name: 'Useful' }));

    expect(sentBody().uselessAxes).toEqual([]);
  });

  it('hides the axis list until a section is flagged', () => {
    render(<ReportFeedback boss={boss} />);

    expect(screen.queryByRole('button', { name: 'Talents' })).not.toBeInTheDocument();
  });

  it('offers no free-text field — the corpus takes no prose', async () => {
    const user = userEvent.setup();
    const { container } = render(<ReportFeedback boss={boss} />);

    await user.click(screen.getByRole('button', { name: 'Flag a section' }));

    expect(container.querySelector('input, textarea')).toBeNull();
  });

  it('acknowledges once recorded, and stops offering a second verdict', async () => {
    const user = userEvent.setup();
    render(<ReportFeedback boss={boss} />);

    await user.click(screen.getByRole('button', { name: 'Useful' }));

    await waitFor(() => expect(screen.getByText(/recorded/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Useful' })).not.toBeInTheDocument();
  });

  it('keeps the selection and says so when the write is refused', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 } as Response));
    const user = userEvent.setup();
    render(<ReportFeedback boss={boss} />);

    await user.click(screen.getByRole('button', { name: 'Flag a section' }));
    await user.click(screen.getByRole('button', { name: 'Talents' }));
    await user.click(screen.getByRole('button', { name: 'Not useful' }));

    await waitFor(() =>
      expect(screen.getByText(/feedback could not be saved/i)).toBeInTheDocument()
    );
    // Le second envoi doit repartir avec le même axe : l'échec n'efface pas le jugement.
    await user.click(screen.getByRole('button', { name: 'Not useful' }));
    const second = vi.mocked(fetch).mock.calls[1];
    expect(
      (JSON.parse((second[1] as RequestInit).body as string) as { uselessAxes: string[] })
        .uselessAxes
    ).toEqual(['talents']);
  });

  it('reports a network failure rather than claiming success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const user = userEvent.setup();
    render(<ReportFeedback boss={boss} />);

    await user.click(screen.getByRole('button', { name: 'Useful' }));

    await waitFor(() =>
      expect(screen.getByText(/feedback could not be saved/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/recorded/i)).not.toBeInTheDocument();
  });
});
