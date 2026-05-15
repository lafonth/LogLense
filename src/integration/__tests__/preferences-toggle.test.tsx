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

function mockPrefsApi(favourites: StoredCharacter[] = [], recents: StoredCharacter[] = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url !== 'string') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ favourites, recents }),
        } as Response);
      }
      if (url.includes('/api/user/favourites')) {
        const body = opts?.body ? (JSON.parse(opts.body as string) as StoredCharacter) : null;
        const isFav = favourites.some((f) => f.name.toLowerCase() === body?.name.toLowerCase());
        const updated = isFav
          ? favourites.filter((f) => f.name.toLowerCase() !== body?.name.toLowerCase())
          : [...favourites, body!];
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ favourites: updated }),
        } as Response);
      }
      if (url.includes('/api/user/preferences')) {
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

describe('preferences toggle flow', () => {
  it('toggling a non-favourite adds it and marks it as favourite', async () => {
    mockPrefsApi([], []);
    const { result } = renderHook(() => usePreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isFavourite(char)).toBe(false);

    act(() => {
      result.current.toggleFavourite(char);
    });

    expect(result.current.isFavourite(char)).toBe(true);
    expect(result.current.favourites).toHaveLength(1);
  });

  it('toggling a favourite removes it', async () => {
    mockPrefsApi([char], []);
    const { result } = renderHook(() => usePreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isFavourite(char)).toBe(true);

    act(() => {
      result.current.toggleFavourite(char);
    });

    expect(result.current.isFavourite(char)).toBe(false);
    expect(result.current.favourites).toHaveLength(0);
  });

  it('adding a recent removes it from the recents list then re-adds it at front', async () => {
    const other: StoredCharacter = { ...char, name: 'Altchar', realmSlug: 'hyjal' };
    mockPrefsApi([], [other]);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/api/user/preferences')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ favourites: [], recents: [other] }),
          } as Response);
        }
        return Promise.resolve({ ok: true } as Response);
      })
    );

    const { result } = renderHook(() => usePreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.recents[0].name).toBe('Altchar');

    act(() => {
      result.current.addRecent(char);
    });

    expect(result.current.recents[0].name).toBe('Jumbaa');
    expect(result.current.recents).toHaveLength(2);
  });

  it('adding an existing recent moves it to front without duplicating', async () => {
    const recents = [char, { ...char, name: 'Altchar', realmSlug: 'hyjal' }];
    mockPrefsApi([], recents);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/api/user/preferences')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ favourites: [], recents }),
          } as Response);
        }
        return Promise.resolve({ ok: true } as Response);
      })
    );

    const { result } = renderHook(() => usePreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.addRecent({ ...char, name: 'Altchar', realmSlug: 'hyjal' });
    });

    expect(result.current.recents[0].name).toBe('Altchar');
    expect(result.current.recents).toHaveLength(2);
  });
});
