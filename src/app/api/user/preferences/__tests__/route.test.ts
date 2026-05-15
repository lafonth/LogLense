import type { StoredCharacter } from '@/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../route';

vi.mock('next-auth/next', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/redis', () => ({ redisGet: vi.fn() }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

import { getServerSession } from 'next-auth/next';
import { redisGet } from '@/lib/redis';

const fav: StoredCharacter = { name: 'Jumbaa', realmName: 'Ysondre', realmSlug: 'ysondre', region: 'EU', class: 'Druid' };

beforeEach(() => {
  vi.mocked(getServerSession).mockResolvedValue({ user: { name: 'Jumbaa#1234' } } as never);
  vi.mocked(redisGet).mockResolvedValue(null);
});

describe('GET /api/user/preferences', () => {
  it('returns empty arrays when no data stored', async () => {
    const res = await GET();
    const body = await res.json() as { favourites: unknown[]; recents: unknown[] };
    expect(body.favourites).toEqual([]);
    expect(body.recents).toEqual([]);
  });

  it('returns empty arrays when unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await GET();
    const body = await res.json() as { favourites: unknown[]; recents: unknown[] };
    expect(body.favourites).toEqual([]);
    expect(body.recents).toEqual([]);
  });

  it('returns stored favourites and recents', async () => {
    vi.mocked(redisGet)
      .mockResolvedValueOnce(JSON.stringify([fav]))
      .mockResolvedValueOnce(JSON.stringify([fav]));
    const res = await GET();
    const body = await res.json() as { favourites: StoredCharacter[]; recents: StoredCharacter[] };
    expect(body.favourites[0].name).toBe('Jumbaa');
    expect(body.recents[0].name).toBe('Jumbaa');
  });
});
