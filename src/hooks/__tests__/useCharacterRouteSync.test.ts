import type { CharacterRoute } from '@/lib/routes';
import type { Zone } from '@/types';
import { renderHook, waitFor } from '@testing-library/react';
import { useSearchParams } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCharacterRouteSync } from '@/hooks/useCharacterRouteSync';

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(),
}));

function mockParams(search: string) {
  vi.mocked(useSearchParams).mockReturnValue(
    new URLSearchParams(search) as ReturnType<typeof useSearchParams>
  );
}

const zone: Zone = {
  id: 42,
  name: 'Test Raid',
  encounters: [
    { id: 1, name: 'Boss One' },
    { id: 2, name: 'Boss Two' },
  ],
};

const route: CharacterRoute = { region: 'EU', realm: 'ysondre', name: 'Jumbaa' };

function makeHookArgs(overrides: Partial<Parameters<typeof useCharacterRouteSync>[0]> = {}) {
  return {
    route,
    zones: [],
    zonesLoading: false,
    start: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  mockParams('');
});

describe('useCharacterRouteSync — param parsing', () => {
  it('returns null for missing params', () => {
    mockParams('');
    const { result } = renderHook(() => useCharacterRouteSync(makeHookArgs()));
    expect(result.current.zoneId).toBeNull();
    expect(result.current.bossParam).toBeNull();
    expect(result.current.specParam).toBeNull();
  });

  it('parses spec, and reports it absent rather than defaulting', () => {
    mockParams('spec=253');
    expect(renderHook(() => useCharacterRouteSync(makeHookArgs())).result.current.specParam).toBe(
      253
    );
    mockParams('');
    expect(
      renderHook(() => useCharacterRouteSync(makeHookArgs())).result.current.specParam
    ).toBeNull();
  });

  it('parses difficulty from URL', () => {
    mockParams('difficulty=5');
    const { result } = renderHook(() => useCharacterRouteSync(makeHookArgs()));
    expect(result.current.difficulty).toBe(5);
  });

  it('defaults difficulty to 4 for missing value', () => {
    mockParams('');
    const { result } = renderHook(() => useCharacterRouteSync(makeHookArgs()));
    expect(result.current.difficulty).toBe(4);
  });

  it('defaults difficulty to 4 for invalid value', () => {
    mockParams('difficulty=99');
    const { result } = renderHook(() => useCharacterRouteSync(makeHookArgs()));
    expect(result.current.difficulty).toBe(4);
  });

  it('accepts difficulty 3 (Normal)', () => {
    mockParams('difficulty=3');
    const { result } = renderHook(() => useCharacterRouteSync(makeHookArgs()));
    expect(result.current.difficulty).toBe(3);
  });

  it('parses zone and boss params', () => {
    mockParams('zone=42&boss=2');
    const { result } = renderHook(() => useCharacterRouteSync(makeHookArgs()));
    expect(result.current.zoneId).toBe(42);
    expect(result.current.bossParam).toBe(2);
  });
});

describe('useCharacterRouteSync — analysis effect', () => {
  it('calls start with the route and zones once spec is known', async () => {
    mockParams('region=EU&difficulty=4&spec=103');
    const start = vi.fn();
    renderHook(() => useCharacterRouteSync(makeHookArgs({ zones: [zone], start })));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        characterName: 'Jumbaa',
        serverSlug: 'ysondre',
        region: 'EU',
        difficulty: 4,
        specId: 103,
      }),
      { preferSnapshot: false }
    );
  });

  // Sans la marque dans l'URL, une ouverture ordinaire ne doit jamais accepter un instantané :
  // un raideur qui relance entre deux pulls verrait celle d'il y a deux heures.
  it('passes the shared marker to the first analysis only', async () => {
    mockParams('difficulty=4&spec=103&shared=1');
    const start = vi.fn();
    const { rerender } = renderHook(() =>
      useCharacterRouteSync(makeHookArgs({ zones: [zone], start }))
    );

    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(start).toHaveBeenLastCalledWith(expect.anything(), { preferSnapshot: true });

    // La marque traîne dans l'URL réécrite, mais un changement de difficulté est une demande
    // neuve : la resservir depuis le cache rendrait l'ancien palier.
    mockParams('difficulty=5&spec=103&shared=1');
    rerender();

    await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
    expect(start).toHaveBeenLastCalledWith(expect.anything(), { preferSnapshot: false });
  });

  it('does not call start when spec is missing', async () => {
    mockParams('difficulty=4');
    const start = vi.fn();
    renderHook(() => useCharacterRouteSync(makeHookArgs({ zones: [zone], start })));
    await new Promise((r) => setTimeout(r, 50));
    expect(start).not.toHaveBeenCalled();
  });

  it('does not call start when zones are loading', async () => {
    mockParams('spec=103');
    const start = vi.fn();
    renderHook(() =>
      useCharacterRouteSync(makeHookArgs({ zones: [zone], zonesLoading: true, start }))
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(start).not.toHaveBeenCalled();
  });

  it('does not fire start again for the same key', async () => {
    mockParams('difficulty=4&spec=103');
    const start = vi.fn();
    const args = makeHookArgs({ zones: [zone], start });
    const { rerender } = renderHook(() => useCharacterRouteSync(args));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    rerender();
    await new Promise((r) => setTimeout(r, 50));
    expect(start).toHaveBeenCalledTimes(1);
  });

  // Il n'y a plus de clé à effacer à la main : changer de sujet, c'est changer d'URL, donc
  // de `route`. Un re-render avec un autre personnage doit relancer l'analyse tout seul.
  it('relaunches the analysis when the route changes to another character', async () => {
    mockParams('difficulty=4&spec=103');
    const start = vi.fn();
    const { rerender } = renderHook(
      (props: { route: CharacterRoute } = { route }) =>
        useCharacterRouteSync(makeHookArgs({ zones: [zone], start, route: props.route })),
      { initialProps: { route } }
    );
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));

    const otherRoute: CharacterRoute = { region: 'EU', realm: 'hyjal', name: 'Altchar' };
    rerender({ route: otherRoute });

    await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
    expect(start).toHaveBeenLastCalledWith(
      expect.objectContaining({ characterName: 'Altchar', serverSlug: 'hyjal' }),
      { preferSnapshot: false }
    );
  });
});
