import type { StoredCharacter } from '@/types';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePreferences } from '@/hooks/usePreferences';

const char: StoredCharacter = {
  name: 'Jumbaa',
  realmName: 'Ysondre',
  realmSlug: 'ysondre',
  region: 'EU',
  class: 'Druid',
};

const altChar: StoredCharacter = {
  name: 'Altchar',
  realmName: 'Hyjal',
  realmSlug: 'hyjal',
  region: 'EU',
  class: 'Hunter',
};

function mockPrefsApi(favourites: StoredCharacter[] = [], recents: StoredCharacter[] = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/user/preferences')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ favourites, recents }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ favourites, recents }),
      } as Response);
    })
  );
}

beforeEach(() => mockPrefsApi());
afterEach(() => vi.unstubAllGlobals());

describe('usePreferences', () => {
  it('loads favourites and recents on mount', async () => {
    mockPrefsApi([char], [altChar]);
    const { result } = renderHook(() => usePreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.favourites).toHaveLength(1);
    expect(result.current.recents).toHaveLength(1);
  });

  it('isFavourite returns true for a stored character', async () => {
    mockPrefsApi([char]);
    const { result } = renderHook(() => usePreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isFavourite(char)).toBe(true);
    expect(result.current.isFavourite(altChar)).toBe(false);
  });

  it('isFavourite is case-insensitive', async () => {
    mockPrefsApi([char]);
    const { result } = renderHook(() => usePreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isFavourite({ ...char, name: 'JUMBAA', realmSlug: 'YSONDRE' })).toBe(
      true
    );
  });

  it('toggleFavourite adds a character optimistically', async () => {
    const { result } = renderHook(() => usePreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ favourites: [char] }),
      } as Response)
    );

    act(() => {
      result.current.toggleFavourite(char);
    });
    expect(result.current.favourites).toHaveLength(1);
  });

  it('toggleFavourite removes a character optimistically', async () => {
    mockPrefsApi([char]);
    const { result } = renderHook(() => usePreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ favourites: [] }),
      } as Response)
    );

    act(() => {
      result.current.toggleFavourite(char);
    });
    expect(result.current.favourites).toHaveLength(0);
  });

  it('addRecent prepends character and deduplicates', async () => {
    mockPrefsApi([], [char]);
    const { result } = renderHook(() => usePreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true } as Response));

    act(() => {
      result.current.addRecent(altChar);
    });
    expect(result.current.recents[0].name).toBe('Altchar');
    expect(result.current.recents).toHaveLength(2);

    act(() => {
      result.current.addRecent(char);
    });
    expect(result.current.recents[0].name).toBe('Jumbaa');
    expect(result.current.recents).toHaveLength(2);
  });

  it('addRecent caps at 5 entries', async () => {
    const fiveChars = Array.from({ length: 5 }, (_, i) => ({
      ...char,
      name: `Char${i}`,
      realmSlug: `realm${i}`,
    }));
    mockPrefsApi([], fiveChars);
    const { result } = renderHook(() => usePreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true } as Response));

    act(() => {
      result.current.addRecent(altChar);
    });
    expect(result.current.recents).toHaveLength(5);
    expect(result.current.recents[0].name).toBe('Altchar');
  });
});
