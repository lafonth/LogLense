import type { WowCharacter, Zone } from '@/types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoggedInCharacterForm } from '@/components/forms/LoggedInCharacterForm';

import { usePreferences } from '@/hooks/usePreferences';

vi.mock('@/hooks/usePreferences', () => ({
  usePreferences: vi.fn(),
}));

const chars: WowCharacter[] = [
  { id: 1, name: 'Jumbaa', realmName: 'Ysondre', realmSlug: 'ysondre', class: 'Druid', level: 80 },
  { id: 2, name: 'Altchar', realmName: 'Hyjal', realmSlug: 'hyjal', class: 'Hunter', level: 80 },
];

const zone: Zone = {
  id: 42,
  name: 'Liberation of Undermine',
  encounters: [
    { id: 1, name: 'Vexie and the Geargrinders' },
    { id: 2, name: 'Cauldron of Carnage' },
  ],
};

function mockPreferences(overrides: Partial<ReturnType<typeof usePreferences>> = {}) {
  vi.mocked(usePreferences).mockReturnValue({
    favourites: [],
    recents: [],
    loading: false,
    isFavourite: vi.fn().mockReturnValue(false),
    toggleFavourite: vi.fn(),
    addRecent: vi.fn(),
    ...overrides,
  });
}

function mockCharFetch(chars: WowCharacter[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(chars),
    } as Response)
  );
}

beforeEach(() => {
  mockPreferences();
  mockCharFetch(chars);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const defaultProps = {
  onSubmit: vi.fn(),
  loading: false,
  zones: [zone],
  zonesLoading: false,
  zonesError: null,
};

describe('loggedInCharacterForm integration', () => {
  it('fetches and displays characters for the default EU region', async () => {
    render(<LoggedInCharacterForm {...defaultProps} />);
    await waitFor(() => expect(screen.getByText('Jumbaa-Ysondre')).toBeInTheDocument());
    expect(screen.getByText('Altchar-Hyjal')).toBeInTheDocument();
  });

  it('displays Starred section when favourites exist for the region', async () => {
    mockPreferences({
      favourites: [
        {
          name: 'Jumbaa',
          realmName: 'Ysondre',
          realmSlug: 'ysondre',
          region: 'EU',
          class: 'Druid',
        },
      ],
      isFavourite: vi.fn().mockReturnValue(true),
    });
    render(<LoggedInCharacterForm {...defaultProps} />);
    await waitFor(() => expect(screen.getByText(/★ starred/i)).toBeInTheDocument());
  });

  it('displays Recent section when recents exist for the region', async () => {
    mockPreferences({
      recents: [
        { name: 'Altchar', realmName: 'Hyjal', realmSlug: 'hyjal', region: 'EU', class: 'Hunter' },
      ],
    });
    render(<LoggedInCharacterForm {...defaultProps} />);
    await waitFor(() => expect(screen.getByText(/recent/i)).toBeInTheDocument());
  });

  it('does not show Starred or Recent sections when they are empty', async () => {
    render(<LoggedInCharacterForm {...defaultProps} />);
    await waitFor(() => screen.getByText('Jumbaa-Ysondre'));
    expect(screen.queryByText(/★ starred/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/recent/i)).not.toBeInTheDocument();
  });

  it('displays "No characters found" when API returns empty list and no favourites', async () => {
    mockCharFetch([]);
    render(<LoggedInCharacterForm {...defaultProps} />);
    await waitFor(() => expect(screen.getByText(/no characters found/i)).toBeInTheDocument());
  });

  it('selecting a character and submitting calls onSubmit with correct input', async () => {
    const onSubmit = vi.fn();
    render(<LoggedInCharacterForm {...defaultProps} onSubmit={onSubmit} />);
    await waitFor(() => screen.getByText('Jumbaa-Ysondre'));

    fireEvent.click(screen.getByText('Jumbaa-Ysondre'));
    fireEvent.click(screen.getByRole('button', { name: /^analyse$/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const [input, zoneId] = onSubmit.mock.calls[0] as [
      Parameters<typeof defaultProps.onSubmit>[0],
      number,
    ];
    expect(input.characterName).toBe('Jumbaa');
    expect(input.serverSlug).toBe('ysondre');
    expect(input.region).toBe('EU');
    expect(zoneId).toBe(42);
  });

  it('calls addRecent when a character is submitted', async () => {
    const addRecent = vi.fn();
    mockPreferences({ addRecent });
    render(<LoggedInCharacterForm {...defaultProps} />);
    await waitFor(() => screen.getByText('Jumbaa-Ysondre'));

    fireEvent.click(screen.getByText('Jumbaa-Ysondre'));
    fireEvent.click(screen.getByRole('button', { name: /^analyse$/i }));

    expect(addRecent).toHaveBeenCalledTimes(1);
  });

  it('analyse button is disabled when no character is selected', async () => {
    render(<LoggedInCharacterForm {...defaultProps} />);
    await waitFor(() => screen.getByText('Jumbaa-Ysondre'));
    expect(screen.getByRole('button', { name: /^analyse$/i })).toBeDisabled();
  });

  it('clicking the star button calls toggleFavourite', async () => {
    const toggleFavourite = vi.fn();
    mockPreferences({ toggleFavourite });
    render(<LoggedInCharacterForm {...defaultProps} />);
    await waitFor(() => screen.getByText('Jumbaa-Ysondre'));

    const starButtons = screen.getAllByTitle(/add to favourites/i);
    fireEvent.click(starButtons[0]);
    expect(toggleFavourite).toHaveBeenCalledTimes(1);
  });

  it('refetches characters when region changes', async () => {
    mockCharFetch(chars);
    render(<LoggedInCharacterForm {...defaultProps} />);
    await waitFor(() => screen.getByText('Jumbaa-Ysondre'));

    const fetchSpy = vi.mocked(fetch);
    const callsBefore = fetchSpy.mock.calls.length;

    fireEvent.change(screen.getByLabelText(/region/i), { target: { value: 'US' } });

    await waitFor(() => expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsBefore));
    const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][0] as string;
    expect(lastCall).toContain('region=US');
  });

  it('shows zone selector from props', async () => {
    render(<LoggedInCharacterForm {...defaultProps} />);
    await waitFor(() => screen.getByText('Jumbaa-Ysondre'));
    expect(screen.getByText('Liberation of Undermine')).toBeInTheDocument();
  });
});
