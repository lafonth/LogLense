import type { ReportActor, ReportFight } from '@/types';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReportAnalysis } from '@/hooks/useReportAnalysis';

const actor: ReportActor = {
  id: 63,
  name: 'Jumbaa',
  type: 'Player',
  subType: 'Priest',
  server: 'Ysondre',
};

function fight(over: Partial<ReportFight> = {}): ReportFight {
  return {
    id: 1,
    name: 'Chimaerus',
    encounterID: 3306,
    kill: true,
    startTime: 0,
    endTime: 180000,
    difficulty: 5,
    ...over,
  };
}

function params(fights: ReportFight[]) {
  return { code: 'abc123', actor, specId: 258, difficulty: 5, fights };
}

function mockFetchOk(body: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) } as Response);
}

/** Le corps de la dernière requête POST, tel que le serveur le recevra. */
function sentBody(): Record<string, unknown> {
  const call = vi.mocked(fetch).mock.calls[0];
  return JSON.parse((call[1] as RequestInit).body as string) as Record<string, unknown>;
}

describe('useReportAnalysis', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetchOk({ bosses: [] }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts idle', () => {
    const { result } = renderHook(() => useReportAnalysis());

    expect(result.current.result).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('keeps only the kills of the requested difficulty', async () => {
    const { result } = renderHook(() => useReportAnalysis());

    await act(async () => {
      await result.current.start(
        params([
          fight({ id: 1 }),
          fight({ id: 2, encounterID: 3307, name: 'Fractillus', difficulty: 4 }),
          fight({ id: 3, encounterID: 3308, name: 'Nexus-King', kill: false }),
        ])
      );
    });

    expect(sentBody().encounters).toEqual([
      { id: 3306, name: 'Chimaerus', fightId: 1, fightMs: 180000 },
    ]);
  });

  it('drops trash pulls, which carry no encounter', async () => {
    const { result } = renderHook(() => useReportAnalysis());

    await act(async () => {
      await result.current.start(
        params([fight({ id: 1, encounterID: 0, name: 'Trash' }), fight({ id: 2 })])
      );
    });

    expect(sentBody().encounters).toEqual([
      { id: 3306, name: 'Chimaerus', fightId: 2, fightMs: 180000 },
    ]);
  });

  it('analyses the most recent kill of an encounter, not the first', async () => {
    const { result } = renderHook(() => useReportAnalysis());

    await act(async () => {
      await result.current.start(
        params([
          fight({ id: 1, startTime: 0, endTime: 200000 }),
          fight({ id: 2, startTime: 500000, endTime: 660000 }),
        ])
      );
    });

    expect(sentBody().encounters).toEqual([
      { id: 3306, name: 'Chimaerus', fightId: 2, fightMs: 160000 },
    ]);
  });

  it('names the actor and its class, since the report path has no rankings lookup', async () => {
    const { result } = renderHook(() => useReportAnalysis());

    await act(async () => {
      await result.current.start(params([fight()]));
    });

    expect(sentBody()).toMatchObject({
      code: 'abc123',
      actorId: 63,
      actorName: 'Jumbaa',
      actorClass: 'Priest',
      specId: 258,
      difficulty: 5,
    });
  });

  it('refuses without spending a request when no kill matches', async () => {
    const { result } = renderHook(() => useReportAnalysis());

    await act(async () => {
      await result.current.start(params([fight({ kill: false })]));
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/no kills found/i);
    expect(result.current.loading).toBe(false);
  });

  it('surfaces the error the server named', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: 'Daily WCL budget spent' }),
      } as unknown as Response)
    );
    const { result } = renderHook(() => useReportAnalysis());

    await act(async () => {
      await result.current.start(params([fight()]));
    });

    expect(result.current.error).toBe('Daily WCL budget spent');
    expect(result.current.result).toBeNull();
  });

  it('falls back to the status code when the failure body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: () => Promise.reject(new Error('not json')),
      } as unknown as Response)
    );
    const { result } = renderHook(() => useReportAnalysis());

    await act(async () => {
      await result.current.start(params([fight()]));
    });

    expect(result.current.error).toBe('HTTP 502');
  });

  it('reports a network failure instead of hanging on loading', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const { result } = renderHook(() => useReportAnalysis());

    await act(async () => {
      await result.current.start(params([fight()]));
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.loading).toBe(false);
  });

  it('clears the previous error when a new analysis starts', async () => {
    const { result } = renderHook(() => useReportAnalysis());

    await act(async () => {
      await result.current.start(params([fight({ kill: false })]));
    });
    expect(result.current.error).not.toBeNull();

    await act(async () => {
      await result.current.start(params([fight()]));
    });

    expect(result.current.error).toBeNull();
    expect(result.current.result).toEqual({ bosses: [] });
  });

  it('reset drops both the result and the error', async () => {
    const { result } = renderHook(() => useReportAnalysis());

    await act(async () => {
      await result.current.start(params([fight()]));
    });
    expect(result.current.result).not.toBeNull();

    act(() => {
      result.current.reset();
    });

    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
