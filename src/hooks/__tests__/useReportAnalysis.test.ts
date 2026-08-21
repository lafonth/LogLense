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

/** Une réponse différente par appel : l'analyse d'abord, la ré-analyse de pull ensuite. */
function mockFetchSequence(...bodies: unknown[]) {
  const fn = vi.fn();
  for (const body of bodies) {
    fn.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(body) } as Response);
  }
  return fn;
}

/** Le corps de la n-ième requête POST, tel que le serveur le recevra. */
function sentBody(callIdx = 0): Record<string, unknown> {
  const call = vi.mocked(fetch).mock.calls[callIdx];
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
        headers: new Headers(),
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

  // Le quota calcule l'échéance exacte et la pose sur le 429 ; l'écran la jetait. Un refus
  // sans échéance se lit comme une panne, et l'utilisateur relance — ce que le quota veut
  // justement éviter.
  it('dit dans combien de temps réessayer quand le serveur l’a chiffré', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '840' }),
        json: () => Promise.resolve({ error: 'Hourly Warcraft Logs quota reached' }),
      } as unknown as Response)
    );
    const { result } = renderHook(() => useReportAnalysis());

    await act(async () => {
      await result.current.start(params([fight()]));
    });

    expect(result.current.error).toBe('Hourly Warcraft Logs quota reached — retry in 14 minutes.');
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

describe('useReportAnalysis · switchPull', () => {
  const fights = [
    fight({ id: 1, startTime: 0, endTime: 200000 }),
    fight({ id: 2, startTime: 500000, endTime: 660000 }),
    fight({ id: 9, encounterID: 3307, name: 'Fractillus', startTime: 700000, endTime: 790000 }),
  ];

  const analysed = {
    input: { specId: 258 },
    bosses: [
      { encounterId: 3306, encounter: 'Chimaerus', dps: 100 },
      { encounterId: 3307, encounter: 'Fractillus', dps: 200 },
    ],
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Une première analyse aboutie, l'état depuis lequel une pull peut être rechoisie. */
  async function analysedHook(...after: unknown[]) {
    vi.stubGlobal('fetch', mockFetchSequence(analysed, ...after));
    const { result } = renderHook(() => useReportAnalysis());
    await act(async () => {
      await result.current.start(params(fights));
    });
    return result;
  }

  it('re-analyses the chosen pull alone, not the whole report', async () => {
    const result = await analysedHook({ bosses: [] });

    await act(async () => {
      await result.current.switchPull(3306, 1);
    });

    expect(sentBody(1)).toMatchObject({
      code: 'abc123',
      actorId: 63,
      difficulty: 5,
      encounters: [{ id: 3306, name: 'Chimaerus', fightId: 1, fightMs: 200000 }],
    });
  });

  it('asks for the spec the server resolved, not the one the caller guessed', async () => {
    // La première analyse a pu partir d'un 0 que le serveur a tranché sur la classe.
    vi.stubGlobal(
      'fetch',
      mockFetchSequence({ ...analysed, input: { specId: 260 } }, { bosses: [] })
    );
    const { result } = renderHook(() => useReportAnalysis());
    await act(async () => {
      await result.current.start({ ...params(fights), specId: 0 });
    });

    await act(async () => {
      await result.current.switchPull(3306, 1);
    });

    expect(sentBody(1).specId).toBe(260);
  });

  it('replaces that encounter and leaves the others as they were read', async () => {
    const result = await analysedHook({
      bosses: [{ encounterId: 3306, encounter: 'Chimaerus', dps: 555 }],
    });

    await act(async () => {
      await result.current.switchPull(3306, 1);
    });

    expect(result.current.result?.bosses).toMatchObject([
      { encounterId: 3306, dps: 555 },
      { encounterId: 3307, dps: 200 },
    ]);
  });

  it('records the pull retained, so the picker shows what is displayed', async () => {
    const result = await analysedHook({ bosses: [] });

    await act(async () => {
      await result.current.switchPull(3306, 1);
    });

    expect(result.current.pullSelection).toEqual({ 3306: 1 });
    expect(result.current.pullStatus).toEqual({});
  });

  it('marks only that encounter as loading while it reloads', async () => {
    vi.stubGlobal('fetch', mockFetchSequence(analysed));
    const { result } = renderHook(() => useReportAnalysis());
    await act(async () => {
      await result.current.start(params(fights));
    });

    let release: (value: Response) => void = () => {};
    vi.mocked(fetch).mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        release = resolve;
      })
    );

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.switchPull(3306, 1);
    });
    expect(result.current.pullStatus).toEqual({ 3306: { status: 'loading' } });

    await act(async () => {
      release({ ok: true, json: () => Promise.resolve({ bosses: [] }) } as Response);
      await pending;
    });
    expect(result.current.pullStatus).toEqual({});
  });

  it('keeps a failed reload on its own boss instead of blanking the screen', async () => {
    vi.stubGlobal('fetch', mockFetchSequence(analysed));
    const { result } = renderHook(() => useReportAnalysis());
    await act(async () => {
      await result.current.start(params(fights));
    });
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    await act(async () => {
      await result.current.switchPull(3306, 1);
    });

    expect(result.current.pullStatus).toEqual({
      3306: { status: 'error', message: 'Network error' },
    });
    // L'erreur globale viderait tout l'écran pour une rencontre sur deux.
    expect(result.current.error).toBeNull();
    expect(result.current.result?.bosses).toHaveLength(2);
  });

  it('spends nothing on a pull that is not a kill of that encounter', async () => {
    const result = await analysedHook({ bosses: [] });

    await act(async () => {
      await result.current.switchPull(3306, 9);
    });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('spends nothing before a first analysis has landed', async () => {
    vi.stubGlobal('fetch', mockFetchOk({ bosses: [] }));
    const { result } = renderHook(() => useReportAnalysis());

    await act(async () => {
      await result.current.switchPull(3306, 1);
    });

    expect(fetch).not.toHaveBeenCalled();
  });
});
