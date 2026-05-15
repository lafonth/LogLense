import type { ReportActor, ReportFight, ReportMeta } from '@/types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportForm } from '@/components/forms/ReportForm';

const actor: ReportActor = {
  id: 7,
  name: 'Jumbaa',
  type: 'Player',
  subType: 'Druid',
  server: 'Ysondre',
};
const fight: ReportFight = {
  id: 1,
  name: 'Gallywix',
  encounterID: 100,
  kill: true,
  startTime: 0,
  endTime: 30000,
  difficulty: 5,
};
const meta: ReportMeta = { title: 'Weekly Mythic Run', actors: [actor], fights: [fight] };

function mockFetchForMeta(result: ReportMeta | null, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      json: () => Promise.resolve(ok ? result : { error: 'Not found' }),
    } as Response)
  );
}

beforeEach(() => {
  mockFetchForMeta(meta);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reportForm integration', () => {
  it('renders report code input and Load Report button', () => {
    render(<ReportForm onSubmit={vi.fn()} loading={false} onBack={vi.fn()} />);
    expect(screen.getByPlaceholderText(/aBcDeFgH/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /load report/i })).toBeInTheDocument();
  });

  it('calls onBack when back button clicked', () => {
    const onBack = vi.fn();
    render(<ReportForm onSubmit={vi.fn()} loading={false} onBack={onBack} />);
    fireEvent.click(screen.getByText(/← Back/));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('load Report is disabled when input is empty', () => {
    render(<ReportForm onSubmit={vi.fn()} loading={false} onBack={vi.fn()} />);
    expect(screen.getByRole('button', { name: /load report/i })).toBeDisabled();
  });

  it('fetches meta and shows character picker after loading a report', async () => {
    render(<ReportForm onSubmit={vi.fn()} loading={false} onBack={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/aBcDeFgH/), {
      target: { value: 'abc1234567890def' },
    });
    fireEvent.click(screen.getByRole('button', { name: /load report/i }));

    await waitFor(() => expect(screen.getByText('Weekly Mythic Run')).toBeInTheDocument());
    expect(screen.getByLabelText(/character/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/difficulty/i)).toBeInTheDocument();
  });

  it('populates character select with actors sorted alphabetically', async () => {
    const actors: ReportActor[] = [
      { id: 1, name: 'Zephyra', type: 'Player', subType: 'Mage', server: 'X' },
      { id: 2, name: 'Altchar', type: 'Player', subType: 'Hunter', server: 'X' },
    ];
    mockFetchForMeta({ title: 'Test', actors, fights: [] });

    render(<ReportForm onSubmit={vi.fn()} loading={false} onBack={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/aBcDeFgH/), {
      target: { value: 'abc1234567890def' },
    });
    fireEvent.click(screen.getByRole('button', { name: /load report/i }));

    await waitFor(() => screen.getByLabelText(/character/i));
    const select = screen.getByLabelText(/character/i) as HTMLSelectElement;
    const names = Array.from(select.options)
      .slice(1) // skip placeholder
      .map((o) => o.text.split(' (')[0]);
    expect(names).toEqual(['Altchar', 'Zephyra']);
  });

  it('calls onSubmit with correct args when character is selected and form submitted', async () => {
    const onSubmit = vi.fn();
    render(<ReportForm onSubmit={onSubmit} loading={false} onBack={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/aBcDeFgH/), {
      target: { value: 'abc1234567890def' },
    });
    fireEvent.click(screen.getByRole('button', { name: /load report/i }));

    await waitFor(() => screen.getByLabelText(/character/i));
    fireEvent.change(screen.getByLabelText(/character/i), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: /^analyse$/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [code, calledActor, difficulty] = onSubmit.mock.calls[0] as [string, ReportActor, number];
    expect(code).toBe('abc1234567890def');
    expect(calledActor.name).toBe('Jumbaa');
    expect(difficulty).toBe(5); // default difficulty is Mythic (5)
  });

  it('analyse button is disabled until a character is selected', async () => {
    render(<ReportForm onSubmit={vi.fn()} loading={false} onBack={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/aBcDeFgH/), {
      target: { value: 'abc1234567890def' },
    });
    fireEvent.click(screen.getByRole('button', { name: /load report/i }));

    await waitFor(() => screen.getByRole('button', { name: /^analyse$/i }));
    expect(screen.getByRole('button', { name: /^analyse$/i })).toBeDisabled();
  });

  it('shows an error banner when load report fails', async () => {
    mockFetchForMeta(null, false);

    // useReportMeta catches HTTP errors via ok flag — mock fetch returning not-ok
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Report not found' }),
      } as Response)
    );

    render(<ReportForm onSubmit={vi.fn()} loading={false} onBack={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/aBcDeFgH/), {
      target: { value: 'abc1234567890def' },
    });
    fireEvent.click(screen.getByRole('button', { name: /load report/i }));

    await waitFor(() => screen.getByText(/report not found/i));
  });
});
