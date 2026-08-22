import type { RaidRanking } from '@/lib/wcl/raid-ranking';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRaidRanking } from '../useRaidRanking';

function ranking(over: Partial<RaidRanking> = {}): RaidRanking {
  return {
    code: 'abc123',
    fightID: 7,
    encounterID: 3306,
    encounterName: 'Chimaerus',
    difficulty: 5,
    kill: true,
    fightMs: 180_000,
    criterion: 'percentile',
    criterionReason: 'Ranked by Warcraft Logs percentile.',
    players: [],
    ...over,
  };
}

function mockOk(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) } as Response)
  );
}

function mockFail(status: number, body: unknown, headers = new Headers()) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      headers,
      json: () => Promise.resolve(body),
    } as unknown as Response)
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useRaidRanking', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useRaidRanking());

    expect(result.current.ranking).toBeNull();
    expect(result.current.fetchedFightID).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('asks the route for that pull of that report', async () => {
    mockOk(ranking());
    const { result } = renderHook(() => useRaidRanking());

    await act(async () => {
      await result.current.fetchRanking('abc123', 7);
    });

    expect(fetch).toHaveBeenCalledWith('/api/raid/abc123?fight=7');
  });

  it('keeps the ranking and the pull it belongs to', async () => {
    mockOk(ranking());
    const { result } = renderHook(() => useRaidRanking());

    await act(async () => {
      await result.current.fetchRanking('abc123', 7);
    });

    expect(result.current.ranking).toEqual(ranking());
    expect(result.current.fetchedFightID).toBe(7);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  /**
   * The reason `fetchedFightID` exists: while a second pull is in flight, the screen must not
   * show the first pull's ranking under the second pull's title.
   */
  it('drops the previous ranking and its pull id while the next one is in flight', async () => {
    mockOk(ranking());
    const { result } = renderHook(() => useRaidRanking());
    await act(async () => {
      await result.current.fetchRanking('abc123', 7);
    });

    let release: (value: Response) => void = () => {};
    vi.mocked(fetch).mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        release = resolve;
      })
    );

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.fetchRanking('abc123', 9);
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.ranking).toBeNull();
    expect(result.current.fetchedFightID).toBeNull();

    await act(async () => {
      release({
        ok: true,
        json: () => Promise.resolve(ranking({ fightID: 9 })),
      } as Response);
      await pending;
    });

    expect(result.current.fetchedFightID).toBe(9);
  });

  it('surfaces the error the server named', async () => {
    mockFail(429, { error: 'Daily WCL budget spent' });
    const { result } = renderHook(() => useRaidRanking());

    await act(async () => {
      await result.current.fetchRanking('abc123', 7);
    });

    expect(result.current.error).toBe('Daily WCL budget spent');
    expect(result.current.ranking).toBeNull();
    expect(result.current.fetchedFightID).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('carries the retry deadline the quota computed', async () => {
    mockFail(
      429,
      { error: 'Hourly Warcraft Logs quota reached' },
      new Headers({ 'Retry-After': '840' })
    );
    const { result } = renderHook(() => useRaidRanking());

    await act(async () => {
      await result.current.fetchRanking('abc123', 7);
    });

    expect(result.current.error).toBe('Hourly Warcraft Logs quota reached — retry in 14 minutes.');
  });

  it('reports a network failure instead of hanging on loading', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const { result } = renderHook(() => useRaidRanking());

    await act(async () => {
      await result.current.fetchRanking('abc123', 7);
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.loading).toBe(false);
  });

  it('clears the previous error when a new pull is asked for', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('Network error')));
    const { result } = renderHook(() => useRaidRanking());
    await act(async () => {
      await result.current.fetchRanking('abc123', 7);
    });
    expect(result.current.error).toBe('Network error');

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(ranking()),
    } as Response);
    await act(async () => {
      await result.current.fetchRanking('abc123', 9);
    });

    expect(result.current.error).toBeNull();
  });

  it('reset drops the ranking, its pull id and the error', async () => {
    mockOk(ranking());
    const { result } = renderHook(() => useRaidRanking());
    await act(async () => {
      await result.current.fetchRanking('abc123', 7);
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.ranking).toBeNull();
    expect(result.current.fetchedFightID).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
