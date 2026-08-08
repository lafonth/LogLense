import type { Zone } from '@/types';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useZones } from '../useZones';

const zones: Zone[] = [
  { id: 1, name: 'Liberation of Undermine', encounters: [{ id: 10, name: 'Gallywix' }] },
];

function mockFetch(response: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      json: () => Promise.resolve(response),
    } as Response)
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useZones', () => {
  it('returns zones on success', async () => {
    mockFetch(zones);
    const { result } = renderHook(() => useZones());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.zones).toEqual(zones);
    expect(result.current.error).toBeNull();
  });

  it('sets error when response contains error field', async () => {
    mockFetch({ error: 'WCL unavailable' });
    const { result } = renderHook(() => useZones());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.zones).toEqual([]);
    expect(result.current.error).toBe('WCL unavailable');
  });

  it('sets error on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const { result } = renderHook(() => useZones());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Network error');
  });

  it('clears the error and refetches when retry is called', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ error: 'WCL down' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(zones) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useZones());
    await waitFor(() => expect(result.current.error).toBe('WCL down'));

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.zones).toEqual(zones);
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('starts in loading state', () => {
    mockFetch(zones);
    const { result } = renderHook(() => useZones());
    expect(result.current.loading).toBe(true);
  });
});
