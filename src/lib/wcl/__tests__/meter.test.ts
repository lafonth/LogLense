import { describe, expect, it, vi } from 'vitest';
import { countWclCall, meterWclCalls } from '../meter';

/** Yields to the microtask queue, so two metered runs actually interleave. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('countWclCall', () => {
  it('does nothing outside a measurement: five routes and the tests call gql that way', () => {
    expect(() => countWclCall()).not.toThrow();
  });
});

describe('meterWclCalls', () => {
  it('returns what the run returned', async () => {
    const settle = vi.fn().mockResolvedValue(undefined);
    await expect(meterWclCalls(async () => 'report', settle)).resolves.toBe('report');
  });

  it('settles the calls the run triggered, however deep they were made', async () => {
    const settle = vi.fn().mockResolvedValue(undefined);
    await meterWclCalls(async () => {
      countWclCall();
      await tick();
      await Promise.all([tick().then(countWclCall), tick().then(countWclCall)]);
    }, settle);
    expect(settle).toHaveBeenCalledWith(3);
  });

  it('settles zero when the run asked Warcraft Logs nothing', async () => {
    const settle = vi.fn().mockResolvedValue(undefined);
    await meterWclCalls(async () => undefined, settle);
    expect(settle).toHaveBeenCalledWith(0);
  });

  it('keeps two concurrent measurements from spending each other, which is why it is a store', async () => {
    const settled: number[] = [];
    const settle = async (calls: number) => {
      settled.push(calls);
    };

    await Promise.all([
      meterWclCalls(async () => {
        countWclCall();
        await tick();
        countWclCall();
      }, settle),
      meterWclCalls(async () => {
        await tick();
        countWclCall();
      }, settle),
    ]);

    expect(settled.sort()).toEqual([1, 2]);
  });

  it('settles what a failed run had already spent, then lets its error through untouched', async () => {
    const settle = vi.fn().mockResolvedValue(undefined);
    const boom = new Error('wcl refused');

    await expect(
      meterWclCalls(async () => {
        countWclCall();
        countWclCall();
        throw boom;
      }, settle)
    ).rejects.toBe(boom);

    expect(settle).toHaveBeenCalledWith(2);
  });

  it('waits for the settlement before handing the result back', async () => {
    const order: string[] = [];
    await meterWclCalls(
      async () => {
        order.push('run');
      },
      async () => {
        await tick();
        order.push('settle');
      }
    );
    expect(order).toEqual(['run', 'settle']);
  });
});
