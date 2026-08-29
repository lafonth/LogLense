import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACCESS_MEMBERS_KEY,
  ACCESS_MODE_KEY,
  ACCESS_PENDING_KEY,
  ACCESS_REQUEST_LIMIT,
  admit,
  decideAccess,
  isBattletag,
  listPending,
  MAX_OPEN_DAYS,
  MAX_PENDING,
  readAccessState,
  requestAccess,
  setAccessMode,
} from '@/lib/access';
import { consumeStrictQuota } from '@/lib/labels/rate-limit';
import {
  redisGet,
  redisHDel,
  redisHGet,
  redisHGetAll,
  redisHLen,
  redisHSet,
  redisSet,
} from '@/lib/redis';

vi.mock('@/lib/redis', () => ({
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  redisHGet: vi.fn(),
  redisHSet: vi.fn(),
  redisHDel: vi.fn(),
  redisHLen: vi.fn(),
  redisHGetAll: vi.fn(),
}));
vi.mock('@/lib/labels/rate-limit', () => ({ consumeStrictQuota: vi.fn() }));

const NOW = Date.parse('2026-08-28T12:00:00.000Z');
const TAG = 'Jumbaa#1234';

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv('BETA_ALLOWLIST', '');
  vi.stubEnv('ADMIN_BATTLETAGS', '');
  vi.mocked(redisGet).mockResolvedValue(null);
  vi.mocked(redisSet).mockResolvedValue(undefined);
  vi.mocked(redisHGet).mockResolvedValue(null);
  vi.mocked(redisHSet).mockResolvedValue(true);
  vi.mocked(redisHDel).mockResolvedValue(true);
  vi.mocked(redisHLen).mockResolvedValue(0);
  vi.mocked(redisHGetAll).mockResolvedValue({});
  vi.mocked(consumeStrictQuota).mockResolvedValue({
    allowed: true,
    retryAfterSeconds: 0,
    unavailable: false,
    consumed: 1,
  });
});

describe('isBattletag', () => {
  it('accepts a battletag and refuses what is not one', () => {
    expect(isBattletag('Jumbaa#1234')).toBe(true);
    expect(isBattletag(' Jumbaa#1234 ')).toBe(true);
    expect(isBattletag('Jumbaa')).toBe(false);
    expect(isBattletag('Jum baa#1234')).toBe(false);
    expect(isBattletag('Jumbaa#12')).toBe(false);
    expect(isBattletag('')).toBe(false);
  });
});

describe('readAccessState', () => {
  it('reads an absent, unreadable or closed value as closed', async () => {
    await expect(readAccessState(NOW)).resolves.toMatchObject({ mode: 'closed', expired: false });

    vi.mocked(redisGet).mockResolvedValue('{not json');
    await expect(readAccessState(NOW)).resolves.toMatchObject({ mode: 'closed' });

    vi.mocked(redisGet).mockResolvedValue(JSON.stringify({ mode: 'closed' }));
    await expect(readAccessState(NOW)).resolves.toMatchObject({ mode: 'closed' });
  });

  it('marks an outdated window expired rather than open', async () => {
    vi.mocked(redisGet).mockResolvedValue(
      JSON.stringify({ mode: 'open', until: '2026-08-01T00:00:00.000Z' })
    );
    await expect(readAccessState(NOW)).resolves.toMatchObject({ mode: 'open', expired: true });
  });

  // Une fenêtre ouverte dont la date est illisible ne doit pas devenir éternelle.
  it('marks a window with no readable end expired', async () => {
    vi.mocked(redisGet).mockResolvedValue(JSON.stringify({ mode: 'open' }));
    await expect(readAccessState(NOW)).resolves.toMatchObject({ expired: true });
  });
});

describe('setAccessMode', () => {
  it('clamps the duration to the ceiling and writes with no TTL', async () => {
    const state = await setAccessMode('open', 999, 'Admin#1', NOW);
    expect(state.until).toBe(new Date(NOW + MAX_OPEN_DAYS * 86_400_000).toISOString());
    expect(state.expired).toBe(false);
    expect(vi.mocked(redisSet)).toHaveBeenCalledWith(ACCESS_MODE_KEY, expect.any(String));
  });

  it('clamps a duration below one day up to one', async () => {
    const state = await setAccessMode('open', 0, 'Admin#1', NOW);
    expect(state.until).toBe(new Date(NOW + 86_400_000).toISOString());
  });
});

describe('decideAccess', () => {
  it('admits an administrator without reading Redis', async () => {
    vi.stubEnv('ADMIN_BATTLETAGS', 'jumbaa#1234');
    await expect(decideAccess(TAG, NOW)).resolves.toEqual({ allowed: true, reason: 'admin' });
    expect(vi.mocked(redisGet)).not.toHaveBeenCalled();
  });

  it('admits the bootstrap list, whatever its case', async () => {
    vi.stubEnv('BETA_ALLOWLIST', 'JUMBAA#1234, Other#1');
    await expect(decideAccess(TAG, NOW)).resolves.toEqual({ allowed: true, reason: 'bootstrap' });
  });

  it('admits everyone while the window is open', async () => {
    vi.mocked(redisGet).mockResolvedValue(
      JSON.stringify({ mode: 'open', until: new Date(NOW + 86_400_000).toISOString() })
    );
    await expect(decideAccess('Nobody#9999', NOW)).resolves.toEqual({
      allowed: true,
      reason: 'open-window',
    });
    expect(vi.mocked(redisHGet)).not.toHaveBeenCalled();
  });

  it('falls back to the nominative list once the window has expired', async () => {
    vi.mocked(redisGet).mockResolvedValue(
      JSON.stringify({ mode: 'open', until: '2026-08-01T00:00:00.000Z' })
    );
    vi.mocked(redisHGet).mockResolvedValue('{"tag":"Jumbaa#1234"}');
    await expect(decideAccess(TAG, NOW)).resolves.toEqual({ allowed: true, reason: 'member' });
    expect(vi.mocked(redisHGet)).toHaveBeenCalledWith(ACCESS_MEMBERS_KEY, 'jumbaa#1234');
  });

  it('refuses an unknown battletag as closed, not as a failure', async () => {
    await expect(decideAccess(TAG, NOW)).resolves.toEqual({ allowed: false, reason: 'closed' });
  });

  // La faute classique du motif : une panne ne doit jamais ouvrir la porte.
  it('fails closed when Redis refuses', async () => {
    vi.mocked(redisGet).mockRejectedValue(new Error('down'));
    await expect(decideAccess(TAG, NOW)).resolves.toEqual({
      allowed: false,
      reason: 'unavailable',
    });
  });

  it('treats a membership read that is not a string as an absence', async () => {
    vi.mocked(redisHGet).mockResolvedValue(undefined as unknown as string);
    await expect(decideAccess(TAG, NOW)).resolves.toEqual({ allowed: false, reason: 'closed' });
  });
});

describe('admit', () => {
  it('writes the member before clearing the request', async () => {
    const order: string[] = [];
    vi.mocked(redisHSet).mockImplementation(async () => {
      order.push('set');
      return true;
    });
    vi.mocked(redisHDel).mockImplementation(async () => {
      order.push('del');
      return true;
    });

    await admit(' Jumbaa#1234 ', 'Admin#1', NOW);

    expect(order).toEqual(['set', 'del']);
    expect(vi.mocked(redisHSet)).toHaveBeenCalledWith(
      ACCESS_MEMBERS_KEY,
      'jumbaa#1234',
      JSON.stringify({ tag: TAG, admittedBy: 'Admin#1', admittedAt: new Date(NOW).toISOString() })
    );
    expect(vi.mocked(redisHDel)).toHaveBeenCalledWith(ACCESS_PENDING_KEY, 'jumbaa#1234');
  });
});

describe('listPending', () => {
  it('orders the queue oldest first and keeps an entry whose value is unreadable', async () => {
    vi.mocked(redisHGetAll).mockResolvedValue({
      'b#2': JSON.stringify({ tag: 'B#2', requestedAt: '2026-08-02T00:00:00.000Z', attempts: 3 }),
      'a#1': JSON.stringify({ tag: 'A#1', requestedAt: '2026-08-01T00:00:00.000Z' }),
      'c#3': 'not json',
    });

    const pending = await listPending();
    expect(pending.map((p) => p.tag)).toEqual(['c#3', 'A#1', 'B#2']);
    expect(pending[1].attempts).toBe(1);
    expect(pending[2].attempts).toBe(3);
  });
});

describe('requestAccess', () => {
  it('records a new request', async () => {
    await expect(requestAccess(TAG, NOW)).resolves.toBe(true);
    expect(vi.mocked(redisHSet)).toHaveBeenCalledWith(
      ACCESS_PENDING_KEY,
      'jumbaa#1234',
      JSON.stringify({ tag: TAG, requestedAt: new Date(NOW).toISOString(), attempts: 1 })
    );
  });

  it('keeps the first date and counts the attempt on a repeat', async () => {
    vi.mocked(redisHGet).mockResolvedValue(
      JSON.stringify({ tag: TAG, requestedAt: '2026-08-01T00:00:00.000Z', attempts: 2 })
    );

    await expect(requestAccess(TAG, NOW)).resolves.toBe(true);
    expect(vi.mocked(redisHSet)).toHaveBeenCalledWith(
      ACCESS_PENDING_KEY,
      'jumbaa#1234',
      JSON.stringify({ tag: TAG, requestedAt: '2026-08-01T00:00:00.000Z', attempts: 3 })
    );
  });

  it('refuses past the hourly quota, before reading the queue', async () => {
    vi.mocked(consumeStrictQuota).mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 60,
      unavailable: false,
      consumed: 0,
    });

    await expect(requestAccess(TAG, NOW)).resolves.toBe(false);
    expect(vi.mocked(consumeStrictQuota)).toHaveBeenCalledWith(
      expect.any(String),
      ACCESS_REQUEST_LIMIT,
      'jumbaa#1234',
      NOW
    );
    expect(vi.mocked(redisHGet)).not.toHaveBeenCalled();
    expect(vi.mocked(redisHSet)).not.toHaveBeenCalled();
  });

  it('refuses a new entry once the queue is full, but still counts a known one', async () => {
    vi.mocked(redisHLen).mockResolvedValue(MAX_PENDING);
    await expect(requestAccess(TAG, NOW)).resolves.toBe(false);
    expect(vi.mocked(redisHSet)).not.toHaveBeenCalled();

    vi.mocked(redisHGet).mockResolvedValue(JSON.stringify({ tag: TAG, attempts: 1 }));
    await expect(requestAccess(TAG, NOW)).resolves.toBe(true);
  });

  // Elle est appelée depuis `signIn` : une exception y rendrait une panne d'authentification.
  it('never throws when Redis refuses', async () => {
    vi.mocked(redisHSet).mockRejectedValue(new Error('down'));
    await expect(requestAccess(TAG, NOW)).resolves.toBe(false);
  });

  it('refuses a battletag that normalises to nothing', async () => {
    await expect(requestAccess('   ', NOW)).resolves.toBe(false);
    expect(vi.mocked(consumeStrictQuota)).not.toHaveBeenCalled();
  });
});
