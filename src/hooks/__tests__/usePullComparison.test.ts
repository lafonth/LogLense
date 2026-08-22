import type { PullComparisonResult, PullPointer } from '@/lib/wcl/pull-pipeline';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePullComparison } from '../usePullComparison';

function pointer(over: Partial<PullPointer> = {}): PullPointer {
  return {
    code: 'abc123',
    fightId: 3,
    actorId: 63,
    name: 'Jumbaa',
    fightMs: 180_000,
    encounterId: 3306,
    difficulty: 5,
    ...over,
  };
}

const params = {
  specId: 258,
  before: pointer(),
  after: pointer({ fightId: 9, fightMs: 165_000 }),
};

/**
 * The hook hands the parsed body back untouched: it never reads a field of it. A shallow
 * stand-in is therefore what the hook actually sees, and building two whole snapshots here
 * would only pin `pull-pipeline`'s shape a second time.
 */
const comparison = {
  before: { fightId: 3 },
  after: { fightId: 9 },
} as unknown as PullComparisonResult;

function mockOk(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) } as Response)
  );
}

/** The body of the n-th POST, as the server will receive it. */
function sentBody(callIdx = 0): Record<string, unknown> {
  const call = vi.mocked(fetch).mock.calls[callIdx];
  return JSON.parse((call[1] as RequestInit).body as string) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('usePullComparison', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => usePullComparison());

    expect(result.current.result).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('posts both pointers and the spec to the comparison route', async () => {
    mockOk(comparison);
    const { result } = renderHook(() => usePullComparison());

    await act(async () => {
      await result.current.start(params);
    });

    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/pull-comparison');
    expect((vi.mocked(fetch).mock.calls[0][1] as RequestInit).method).toBe('POST');
    expect(sentBody()).toEqual({
      specId: 258,
      before: pointer(),
      after: pointer({ fightId: 9, fightMs: 165_000 }),
    });
  });

  it('keeps the comparison the server returned', async () => {
    mockOk(comparison);
    const { result } = renderHook(() => usePullComparison());

    await act(async () => {
      await result.current.start(params);
    });

    expect(result.current.result).toEqual(comparison);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('drops the previous comparison while the next one is in flight', async () => {
    mockOk(comparison);
    const { result } = renderHook(() => usePullComparison());
    await act(async () => {
      await result.current.start(params);
    });

    let release: (value: Response) => void = () => {};
    vi.mocked(fetch).mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        release = resolve;
      })
    );

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.start(params);
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.result).toBeNull();

    await act(async () => {
      release({ ok: true, json: () => Promise.resolve(comparison) } as Response);
      await pending;
    });

    expect(result.current.result).toEqual(comparison);
  });

  it('surfaces the error the server named', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers(),
        json: () => Promise.resolve({ error: 'One of the two pulls has no such actor' }),
      } as unknown as Response)
    );
    const { result } = renderHook(() => usePullComparison());

    await act(async () => {
      await result.current.start(params);
    });

    expect(result.current.error).toBe('One of the two pulls has no such actor');
    expect(result.current.result).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('carries the retry deadline the quota computed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '840' }),
        json: () => Promise.resolve({ error: 'Hourly Warcraft Logs quota reached' }),
      } as unknown as Response)
    );
    const { result } = renderHook(() => usePullComparison());

    await act(async () => {
      await result.current.start(params);
    });

    expect(result.current.error).toBe('Hourly Warcraft Logs quota reached — retry in 14 minutes.');
  });

  it('reports a network failure instead of hanging on loading', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const { result } = renderHook(() => usePullComparison());

    await act(async () => {
      await result.current.start(params);
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.loading).toBe(false);
  });

  it('clears the previous error when a new comparison starts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('Network error')));
    const { result } = renderHook(() => usePullComparison());
    await act(async () => {
      await result.current.start(params);
    });
    expect(result.current.error).toBe('Network error');

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(comparison),
    } as Response);
    await act(async () => {
      await result.current.start(params);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.result).toEqual(comparison);
  });

  it('reset drops both the comparison and the error', async () => {
    mockOk(comparison);
    const { result } = renderHook(() => usePullComparison());
    await act(async () => {
      await result.current.start(params);
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });

  /** `start` is memoised: an effect that depends on it must not loop on every render. */
  it('keeps the same start between renders', () => {
    mockOk(comparison);
    const { result, rerender } = renderHook(() => usePullComparison());
    const first = result.current.start;

    rerender();

    expect(result.current.start).toBe(first);
  });
});
