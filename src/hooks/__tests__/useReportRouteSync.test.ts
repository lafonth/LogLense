import type { ReportRoute } from '@/lib/routes';
import type { ReportActor, ReportFight, ReportMeta } from '@/types';
import { renderHook, waitFor } from '@testing-library/react';
import { useSearchParams } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useReportRouteSync } from '@/hooks/useReportRouteSync';

vi.mock('next/navigation', () => ({
  useSearchParams: vi.fn(),
}));

function mockParams(search: string) {
  vi.mocked(useSearchParams).mockReturnValue(
    new URLSearchParams(search) as ReturnType<typeof useSearchParams>
  );
}

const route: ReportRoute = { code: 'abc123', actorId: 7 };

const actors: ReportActor[] = [
  { id: 7, name: 'Jumbaa', type: 'Player', subType: 'Druid', server: 'Ysondre' },
  { id: 8, name: 'Altchar', type: 'Player', subType: 'Priest', server: 'Ysondre' },
];
const fights: ReportFight[] = [
  {
    id: 1,
    name: 'Boss',
    encounterID: 100,
    kill: true,
    startTime: 0,
    endTime: 30000,
    difficulty: 4,
  },
];
const reportMeta: ReportMeta = { title: 'Test Report', actors, fights };

function makeHookArgs(overrides: Partial<Parameters<typeof useReportRouteSync>[0]> = {}) {
  return {
    route,
    meta: null,
    fetchedCode: null,
    metaLoading: false,
    metaError: null,
    fetchMeta: vi.fn(),
    startReport: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  mockParams('');
});

describe('useReportRouteSync — param parsing', () => {
  it('returns null for missing params', () => {
    mockParams('');
    const { result } = renderHook(() => useReportRouteSync(makeHookArgs()));
    expect(result.current.specParam).toBeNull();
    expect(result.current.bossParam).toBeNull();
  });

  it('parses spec, and reports it absent rather than defaulting', () => {
    mockParams('spec=253');
    expect(renderHook(() => useReportRouteSync(makeHookArgs())).result.current.specParam).toBe(253);
    mockParams('');
    expect(
      renderHook(() => useReportRouteSync(makeHookArgs())).result.current.specParam
    ).toBeNull();
  });

  it('defaults difficulty to 4 for missing value', () => {
    mockParams('');
    const { result } = renderHook(() => useReportRouteSync(makeHookArgs()));
    expect(result.current.difficulty).toBe(4);
  });

  it('accepts difficulty 3 (Normal)', () => {
    mockParams('difficulty=3');
    const { result } = renderHook(() => useReportRouteSync(makeHookArgs()));
    expect(result.current.difficulty).toBe(3);
  });

  it('parses the boss param', () => {
    mockParams('boss=2');
    const { result } = renderHook(() => useReportRouteSync(makeHookArgs()));
    expect(result.current.bossParam).toBe(2);
  });
});

describe('useReportRouteSync — report meta fetch effect', () => {
  it('calls fetchMeta when meta is not yet loaded for this code', async () => {
    mockParams('spec=103');
    const fetchMeta = vi.fn();
    renderHook(() => useReportRouteSync(makeHookArgs({ fetchMeta })));
    await waitFor(() => expect(fetchMeta).toHaveBeenCalledWith('abc123'));
  });

  it('does not fetch meta when spec is missing', async () => {
    mockParams('');
    const fetchMeta = vi.fn();
    renderHook(() => useReportRouteSync(makeHookArgs({ fetchMeta })));
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMeta).not.toHaveBeenCalled();
  });

  // Le garde-fou explicite du hook : sans lui, l'échec repasse `metaLoading` à faux, ce qui
  // réveille l'effet, qui redemande la méta — une rafale de requêtes WCL sur un rapport qui
  // vient précisément de refuser d'en donner.
  it('does not call fetchMeta again after a meta error', async () => {
    mockParams('spec=103');
    const fetchMeta = vi.fn();
    const { rerender } = renderHook(
      (props: { metaError: string | null }) =>
        useReportRouteSync(makeHookArgs({ fetchMeta, metaError: props.metaError })),
      { initialProps: { metaError: null } as { metaError: string | null } }
    );
    await waitFor(() => expect(fetchMeta).toHaveBeenCalledTimes(1));

    rerender({ metaError: 'Report not found' });
    await new Promise((r) => setTimeout(r, 50));
    rerender({ metaError: 'Report not found' });
    await new Promise((r) => setTimeout(r, 50));

    expect(fetchMeta).toHaveBeenCalledTimes(1);
  });

  it('retryMeta replays the fetch after an error', () => {
    mockParams('spec=103');
    const fetchMeta = vi.fn();
    const { result } = renderHook(() =>
      useReportRouteSync(makeHookArgs({ fetchMeta, metaError: 'Report not found' }))
    );

    result.current.retryMeta();

    expect(fetchMeta).toHaveBeenLastCalledWith('abc123');
  });

  it('calls startReport once meta is loaded and actor found', async () => {
    mockParams('difficulty=4&spec=103');
    const startReport = vi.fn();
    const fetchMeta = vi.fn();
    renderHook(() =>
      useReportRouteSync(
        makeHookArgs({ meta: reportMeta, fetchedCode: 'abc123', startReport, fetchMeta })
      )
    );
    await waitFor(() => expect(startReport).toHaveBeenCalledTimes(1));
    expect(startReport).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'abc123', difficulty: 4 })
    );
  });

  it('does not fire start again for the same key', async () => {
    mockParams('difficulty=4&spec=103');
    const startReport = vi.fn();
    const args = makeHookArgs({ meta: reportMeta, fetchedCode: 'abc123', startReport });
    const { rerender } = renderHook(() => useReportRouteSync(args));
    await waitFor(() => expect(startReport).toHaveBeenCalledTimes(1));
    rerender();
    await new Promise((r) => setTimeout(r, 50));
    expect(startReport).toHaveBeenCalledTimes(1);
  });

  // Il n'y a plus de clé à effacer à la main : changer d'acteur, c'est changer de segment
  // d'URL, donc de `route`. Un re-render avec un autre acteur doit relancer l'analyse.
  it('relaunches the analysis when the route changes to another actor', async () => {
    mockParams('difficulty=4&spec=103');
    const startReport = vi.fn();
    const { rerender } = renderHook(
      (props: { route: ReportRoute } = { route }) =>
        useReportRouteSync(
          makeHookArgs({
            meta: reportMeta,
            fetchedCode: 'abc123',
            startReport,
            route: props.route,
          })
        ),
      { initialProps: { route } }
    );
    await waitFor(() => expect(startReport).toHaveBeenCalledTimes(1));

    const otherRoute: ReportRoute = { code: 'abc123', actorId: 8 };
    rerender({ route: otherRoute });

    await waitFor(() => expect(startReport).toHaveBeenCalledTimes(2));
    expect(startReport).toHaveBeenLastCalledWith(expect.objectContaining({ actor: actors[1] }));
  });
});
