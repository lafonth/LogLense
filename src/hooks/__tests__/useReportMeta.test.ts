import type { ReportMeta } from '@/types';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearReportMetaCache } from '@/lib/report-meta-cache';
import { useReportMeta } from '../useReportMeta';

const meta: ReportMeta = {
  title: 'Manaforge Omega — Mythic',
  fights: [
    {
      id: 1,
      name: 'Chimaerus',
      encounterID: 3306,
      kill: true,
      startTime: 0,
      endTime: 180_000,
      difficulty: 5,
    },
  ],
  actors: [{ id: 63, name: 'Jumbaa', type: 'Player', subType: 'Priest', server: 'Ysondre' }],
};

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
  // Le cache vit dans le module, donc entre les cas : sans ça, le deuxième test à demander
  // `abc123` serait servi par le premier et n'appellerait plus `fetch`.
  clearReportMetaCache();
});

describe('useReportMeta', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useReportMeta());

    expect(result.current.meta).toBeNull();
    expect(result.current.fetchedCode).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('asks the route for that report and keeps the code it answered for', async () => {
    mockOk(meta);
    const { result } = renderHook(() => useReportMeta());

    await act(async () => {
      await result.current.fetchMeta('abc123');
    });

    expect(fetch).toHaveBeenCalledWith('/api/report/abc123');
    expect(result.current.meta).toEqual(meta);
    expect(result.current.fetchedCode).toBe('abc123');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  /** Same guard as the ranking hook: no report shown under another report's code. */
  it('drops the previous report and its code while the next one is in flight', async () => {
    mockOk(meta);
    const { result } = renderHook(() => useReportMeta());
    await act(async () => {
      await result.current.fetchMeta('abc123');
    });

    let release: (value: Response) => void = () => {};
    vi.mocked(fetch).mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        release = resolve;
      })
    );

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.fetchMeta('def456');
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.meta).toBeNull();
    expect(result.current.fetchedCode).toBeNull();

    await act(async () => {
      release({ ok: true, json: () => Promise.resolve(meta) } as Response);
      await pending;
    });

    expect(result.current.fetchedCode).toBe('def456');
  });

  it('surfaces the error the server named', async () => {
    mockFail(404, { error: 'Report not found' });
    const { result } = renderHook(() => useReportMeta());

    await act(async () => {
      await result.current.fetchMeta('nope');
    });

    expect(result.current.error).toBe('Report not found');
    expect(result.current.meta).toBeNull();
    expect(result.current.fetchedCode).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('falls back to the status code when the failure body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        headers: new Headers(),
        json: () => Promise.reject(new Error('not json')),
      } as unknown as Response)
    );
    const { result } = renderHook(() => useReportMeta());

    await act(async () => {
      await result.current.fetchMeta('abc123');
    });

    expect(result.current.error).toBe('HTTP 502');
  });

  it('carries the retry deadline the quota computed', async () => {
    mockFail(
      429,
      { error: 'Hourly Warcraft Logs quota reached' },
      new Headers({ 'Retry-After': '30' })
    );
    const { result } = renderHook(() => useReportMeta());

    await act(async () => {
      await result.current.fetchMeta('abc123');
    });

    expect(result.current.error).toBe('Hourly Warcraft Logs quota reached — retry in 30 seconds.');
  });

  it('reports a network failure instead of hanging on loading', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const { result } = renderHook(() => useReportMeta());

    await act(async () => {
      await result.current.fetchMeta('abc123');
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.loading).toBe(false);
  });

  it('clears the previous error when another report is asked for', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('Network error')));
    const { result } = renderHook(() => useReportMeta());
    await act(async () => {
      await result.current.fetchMeta('abc123');
    });
    expect(result.current.error).toBe('Network error');

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(meta),
    } as Response);
    await act(async () => {
      await result.current.fetchMeta('def456');
    });

    expect(result.current.error).toBeNull();
  });

  it('reset drops the report, its code and the error', async () => {
    mockOk(meta);
    const { result } = renderHook(() => useReportMeta());
    await act(async () => {
      await result.current.fetchMeta('abc123');
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.meta).toBeNull();
    expect(result.current.fetchedCode).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
