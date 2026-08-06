import type { BossResult } from '@/types';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnalysis } from '@/hooks/useAnalysis';

const mockBossResult: BossResult = {
  encounter: 'Chimaerus',
  encounterId: 3306,
  specId: 103,
  difficulty: 5,
  fightTargets: [],
  character: {
    stats: {
      name: 'Jumbaa',
      avgIlvl: 635,
      primaryStat: 13200,
      crit: 3890,
      haste: 3500,
      mastery: 5800,
      vers: 750,
      talents: {},
    },
    rotation: { name: 'Jumbaa', dps: 250000, fightDurationMs: 180000, casts: {}, buffs: {} },
    damageTable: { entries: [] },
    dps: 250000,
    bossDps: null,
    killTime: '3:00',
    overallPct: 95.5,
    overallPctOf: 1000,
    todayPct: 92.1,
    bossDpsPct: null,
    bracket: 0,
    source: { code: 'abc', fightID: 17, actorId: 63 },
    eligibility: { tierPieces: 4, externalUptime: 0, externals: [] },
  },
  topPlayers: [],
  sample: [],
  comparability: {
    level: 'close',
    referenceIlvl: 636,
    myIlvl: 635,
    referenceKillTimeMs: 178000,
    myKillTimeMs: 180000,
    candidatesConsidered: 500,
    pagesFetched: 5,
    disqualified: 0,
    substituted: 0,
  },
};

const baseInput = {
  characterName: 'Jumbaa',
  serverSlug: 'ysondre',
  region: 'EU' as const,
  difficulty: 4 as const,
  encounters: [{ id: 3306, name: 'Chimaerus' }],
  specId: 103,
};

function mockFetchOk(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
  } as Response);
}

function mockFetchError(status: number, error: string) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ error }),
  } as unknown as Response);
}

function mockFetchNetworkError() {
  return vi.fn().mockRejectedValue(new Error('Network error'));
}

describe('useAnalysis', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetchOk(mockBossResult));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts in idle state with no boss states', () => {
    const { result } = renderHook(() => useAnalysis());
    expect(result.current.bossStates).toHaveLength(0);
    expect(result.current.input).toBeNull();
    expect(result.current.isAnyLoading).toBe(false);
  });

  it('sets loading state immediately on start()', async () => {
    const { result } = renderHook(() => useAnalysis());

    // Use a deferred fetch so we can inspect state while the hook is mid-flight
    let resolveFetch!: () => void;
    const fetchPaused = new Promise<void>((resolve) => {
      resolveFetch = resolve;
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        // Pause here so the loading state is observable
        await fetchPaused;
        return { ok: true, json: () => Promise.resolve(mockBossResult) } as Response;
      })
    );

    // Start without awaiting so the hook is paused at the fetch
    let startDone = false;
    act(() => {
      void result.current.start(baseInput).then(() => {
        startDone = true;
      });
    });

    // At this point start() has fired setBossStates([loading]) and is blocked on fetch
    await waitFor(() => {
      expect(result.current.bossStates[0]?.status).toBe('loading');
    });

    // Unblock the fetch and wait for completion
    await act(async () => {
      resolveFetch();
      await waitFor(() => startDone);
    });

    expect(result.current.bossStates[0].status).toBe('success');
  });

  it('transitions to success with result after fetch', async () => {
    const { result } = renderHook(() => useAnalysis());

    await act(async () => {
      await result.current.start(baseInput);
    });

    expect(result.current.bossStates[0].status).toBe('success');
    if (result.current.bossStates[0].status === 'success') {
      expect(result.current.bossStates[0].result?.encounter).toBe('Chimaerus');
    }
    expect(result.current.isAnyLoading).toBe(false);
    expect(result.current.input).toEqual(baseInput);
  });

  it('transitions to success with null when API returns null (no parses)', async () => {
    vi.stubGlobal('fetch', mockFetchOk(null));
    const { result } = renderHook(() => useAnalysis());

    await act(async () => {
      await result.current.start(baseInput);
    });

    expect(result.current.bossStates[0].status).toBe('success');
    if (result.current.bossStates[0].status === 'success') {
      expect(result.current.bossStates[0].result).toBeNull();
    }
  });

  it('transitions to error when API returns non-ok response', async () => {
    vi.stubGlobal('fetch', mockFetchError(500, 'WCL rate limit'));
    const { result } = renderHook(() => useAnalysis());

    await act(async () => {
      await result.current.start(baseInput);
    });

    expect(result.current.bossStates[0].status).toBe('error');
    if (result.current.bossStates[0].status === 'error') {
      expect(result.current.bossStates[0].message).toBe('WCL rate limit');
    }
  });

  it('transitions to error on network failure', async () => {
    vi.stubGlobal('fetch', mockFetchNetworkError());
    const { result } = renderHook(() => useAnalysis());

    await act(async () => {
      await result.current.start(baseInput);
    });

    expect(result.current.bossStates[0].status).toBe('error');
    if (result.current.bossStates[0].status === 'error') {
      expect(result.current.bossStates[0].message).toBe('Network error');
    }
  });

  it('returns cached result instantly on difficulty switch back', async () => {
    const { result } = renderHook(() => useAnalysis());

    await act(async () => {
      await result.current.start(baseInput);
    });

    const fetchMock = mockFetchOk(mockBossResult);
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      await result.current.start({ ...baseInput, difficulty: 5 });
    });

    // switch back to 4 — should hit cache, no second fetch for difficulty 4
    const callCountAfterFirst = fetchMock.mock.calls.length;
    await act(async () => {
      await result.current.start(baseInput);
    });
    expect(fetchMock.mock.calls.length).toBe(callCountAfterFirst); // no new fetch
    expect(result.current.bossStates[0].status).toBe('success');
  });

  it('reset() clears all state', async () => {
    const { result } = renderHook(() => useAnalysis());

    await act(async () => {
      await result.current.start(baseInput);
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.bossStates).toHaveLength(0);
    expect(result.current.input).toBeNull();
    expect(result.current.currentDifficulty).toBeNull();
  });
});
