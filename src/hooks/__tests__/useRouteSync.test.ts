import type { Zone } from '@/types';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useSearchParams } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useRouteSync } from '@/hooks/useRouteSync';

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

function makeHookArgs(overrides: Partial<Parameters<typeof useRouteSync>[0]> = {}) {
  return {
    zones: [],
    zonesLoading: false,
    reportMeta: null,
    fetchedCode: null,
    reportMetaLoading: false,
    start: vi.fn(),
    startReport: vi.fn(),
    fetchMeta: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  mockParams('');
});

describe('useRouteSync — param parsing', () => {
  it('returns null for missing params', () => {
    mockParams('');
    const { result } = renderHook(() => useRouteSync(makeHookArgs()));
    expect(result.current.char).toBeNull();
    expect(result.current.server).toBeNull();
    expect(result.current.zoneId).toBeNull();
    expect(result.current.bossParam).toBeNull();
    expect(result.current.reportCode).toBeNull();
    expect(result.current.reportActorId).toBeNull();
  });

  it('parses char, server, region, difficulty from URL', () => {
    mockParams('char=Jumbaa&server=ysondre&region=US&difficulty=5');
    const { result } = renderHook(() => useRouteSync(makeHookArgs()));
    expect(result.current.char).toBe('Jumbaa');
    expect(result.current.server).toBe('ysondre');
    expect(result.current.region).toBe('US');
    expect(result.current.difficulty).toBe(5);
  });

  it('defaults difficulty to 4 for missing value', () => {
    mockParams('char=Jumbaa&server=ysondre');
    const { result } = renderHook(() => useRouteSync(makeHookArgs()));
    expect(result.current.difficulty).toBe(4);
  });

  it('defaults difficulty to 4 for invalid value', () => {
    mockParams('difficulty=99');
    const { result } = renderHook(() => useRouteSync(makeHookArgs()));
    expect(result.current.difficulty).toBe(4);
  });

  it('accepts difficulty 3 (Normal)', () => {
    mockParams('difficulty=3');
    const { result } = renderHook(() => useRouteSync(makeHookArgs()));
    expect(result.current.difficulty).toBe(3);
  });

  it('defaults region to EU when missing', () => {
    mockParams('');
    const { result } = renderHook(() => useRouteSync(makeHookArgs()));
    expect(result.current.region).toBe('EU');
  });

  it('parses report params', () => {
    mockParams('report=abc123&actor=7&difficulty=4');
    const { result } = renderHook(() => useRouteSync(makeHookArgs()));
    expect(result.current.reportCode).toBe('abc123');
    expect(result.current.reportActorId).toBe(7);
    expect(result.current.reportDifficulty).toBe(4);
  });

  it('parses zone and boss params', () => {
    mockParams('zone=42&boss=2');
    const { result } = renderHook(() => useRouteSync(makeHookArgs()));
    expect(result.current.zoneId).toBe(42);
    expect(result.current.bossParam).toBe(2);
  });
});

describe('useRouteSync — character analysis effect', () => {
  it('calls start when char, server, and zones are present', async () => {
    mockParams('char=Jumbaa&server=ysondre&region=EU&difficulty=4');
    const start = vi.fn();
    renderHook(() => useRouteSync(makeHookArgs({ zones: [zone], start })));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        characterName: 'Jumbaa',
        serverSlug: 'ysondre',
        region: 'EU',
        difficulty: 4,
      })
    );
  });

  it('does not call start when zones are loading', async () => {
    mockParams('char=Jumbaa&server=ysondre');
    const start = vi.fn();
    renderHook(() => useRouteSync(makeHookArgs({ zones: [zone], zonesLoading: true, start })));
    await new Promise((r) => setTimeout(r, 50));
    expect(start).not.toHaveBeenCalled();
  });

  it('does not call start when char or server is missing', async () => {
    mockParams('server=ysondre');
    const start = vi.fn();
    renderHook(() => useRouteSync(makeHookArgs({ zones: [zone], start })));
    await new Promise((r) => setTimeout(r, 50));
    expect(start).not.toHaveBeenCalled();
  });

  it('does not fire start again for the same key', async () => {
    mockParams('char=Jumbaa&server=ysondre&region=EU&difficulty=4');
    const start = vi.fn();
    const args = makeHookArgs({ zones: [zone], start });
    const { rerender } = renderHook(() => useRouteSync(args));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    rerender();
    await new Promise((r) => setTimeout(r, 50));
    expect(start).toHaveBeenCalledTimes(1);
  });
});

describe('useRouteSync — clearCharKey / clearReportKey / setReportKey', () => {
  it('clearCharKey allows start to fire again for same params', async () => {
    mockParams('char=Jumbaa&server=ysondre&region=EU&difficulty=4');
    const start = vi.fn();
    const { result, rerender } = renderHook(() =>
      useRouteSync(makeHookArgs({ zones: [zone], start }))
    );
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.clearCharKey();
    });
    rerender();
    await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
  });

  it('setReportKey re-blocks startReport after clearReportKey', async () => {
    mockParams('report=abc123&actor=7&difficulty=4');
    const startReport = vi.fn();
    const fetchMeta = vi.fn();
    const actors = [{ id: 7, name: 'Jumbaa', type: 'Player', subType: 'Druid', server: 'Ysondre' }];
    const fights = [
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
    const reportMeta = { title: 'Test Report', actors, fights };
    const { result, rerender } = renderHook(() =>
      useRouteSync(makeHookArgs({ reportMeta, fetchedCode: 'abc123', startReport, fetchMeta }))
    );
    await waitFor(() => expect(startReport).toHaveBeenCalledTimes(1));

    // Clear the key and immediately re-set it — net effect: re-render should not fire again
    act(() => {
      result.current.clearReportKey();
    });
    act(() => {
      result.current.setReportKey('abc123|7|4');
    });
    rerender();
    await new Promise((r) => setTimeout(r, 50));
    expect(startReport).toHaveBeenCalledTimes(1);
  });
});

describe('useRouteSync — report meta fetch effect', () => {
  it('calls fetchMeta when reportCode present but meta not yet loaded', async () => {
    mockParams('report=abc123&actor=7');
    const fetchMeta = vi.fn();
    renderHook(() => useRouteSync(makeHookArgs({ fetchMeta })));
    await waitFor(() => expect(fetchMeta).toHaveBeenCalledWith('abc123'));
  });

  it('calls startReport once meta is loaded and actor found', async () => {
    mockParams('report=abc123&actor=7&difficulty=4');
    const startReport = vi.fn();
    const fetchMeta = vi.fn();
    const actors = [{ id: 7, name: 'Jumbaa', type: 'Player', subType: 'Druid', server: 'Ysondre' }];
    const fights = [
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
    const reportMeta = { title: 'Test Report', actors, fights };
    renderHook(() =>
      useRouteSync(makeHookArgs({ reportMeta, fetchedCode: 'abc123', startReport, fetchMeta }))
    );
    await waitFor(() => expect(startReport).toHaveBeenCalledTimes(1));
    expect(startReport).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'abc123', difficulty: 4 })
    );
  });
});
