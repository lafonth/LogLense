import type { PullPointer } from '@/lib/wcl/pull-pipeline';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CORPUS_MONTH_CAP } from '../corpus';
import { EXPOSURE_LIMIT } from '../rate-limit';
import { recordPullComparison } from '../record-pull-comparison';

const { getServerSession, redisAppend, redisLlen, redisIncrBy, redisExpire } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  redisAppend: vi.fn(),
  redisLlen: vi.fn(),
  redisIncrBy: vi.fn(),
  redisExpire: vi.fn(),
}));

vi.mock('next-auth/next', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/redis', () => ({ redisAppend, redisLlen, redisIncrBy, redisExpire }));

const SESSION = { user: { email: 'raider@example.com' } };

function pointer(over: Partial<PullPointer> = {}): PullPointer {
  return {
    code: 'abc',
    fightId: 17,
    actorId: 63,
    name: 'Jumbaa',
    fightMs: 180000,
    encounterId: 3306,
    difficulty: 5,
    ...over,
  };
}

function written() {
  return redisAppend.mock.calls.map(([, value]) => JSON.parse(String(value)));
}

describe('recordPullComparison', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LABEL_SALT = 'pepper';
    getServerSession.mockResolvedValue(SESSION);
    redisAppend.mockResolvedValue(1);
    redisLlen.mockResolvedValue(0);
    redisIncrBy.mockResolvedValue(1);
    redisExpire.mockResolvedValue(undefined);
  });

  it('writes only pointers, no third-party name', async () => {
    await recordPullComparison(pointer(), pointer({ fightId: 18 }), 103);

    expect(redisAppend).toHaveBeenCalledTimes(1);
    expect(String(redisAppend.mock.calls[0][0])).toMatch(/^labels:pull-comparison:\d{4}-\d{2}$/);
    expect(written()[0]).toEqual({
      v: 1,
      kind: 'pull-comparison',
      at: expect.any(String),
      by: expect.stringMatching(/^[0-9a-f]{32}$/),
      specId: 103,
      before: { code: 'abc', fightID: 17, actorId: 63 },
      after: { code: 'abc', fightID: 18, actorId: 63 },
    });
    expect(JSON.stringify(written()[0])).not.toContain('Jumbaa');
  });

  it('records an unauthenticated comparison as anonymous', async () => {
    getServerSession.mockResolvedValue(null);

    await recordPullComparison(pointer(), pointer({ fightId: 18 }), 103);

    expect(written()[0].by).toBeNull();
  });

  it('writes nothing once the month has reached its cap', async () => {
    redisLlen.mockResolvedValue(CORPUS_MONTH_CAP);

    await recordPullComparison(pointer(), pointer({ fightId: 18 }), 103);

    expect(redisAppend).not.toHaveBeenCalled();
  });

  it('writes nothing when the salt is missing and a session exists', async () => {
    delete process.env.LABEL_SALT;

    await recordPullComparison(pointer(), pointer({ fightId: 18 }), 103);

    expect(redisAppend).not.toHaveBeenCalled();
  });

  it('stops writing once the account has exhausted its hourly quota', async () => {
    redisIncrBy.mockResolvedValue(EXPOSURE_LIMIT + 1);

    await recordPullComparison(pointer(), pointer({ fightId: 18 }), 103);

    expect(redisAppend).not.toHaveBeenCalled();
  });

  it('never throws when the write fails', async () => {
    redisAppend.mockRejectedValue(new Error('upstash down'));

    await expect(
      recordPullComparison(pointer(), pointer({ fightId: 18 }), 103)
    ).resolves.toBeUndefined();
  });

  it('never throws when the session cannot be read', async () => {
    getServerSession.mockRejectedValue(new Error('auth down'));

    await expect(
      recordPullComparison(pointer(), pointer({ fightId: 18 }), 103)
    ).resolves.toBeUndefined();
    expect(redisAppend).not.toHaveBeenCalled();
  });
});
