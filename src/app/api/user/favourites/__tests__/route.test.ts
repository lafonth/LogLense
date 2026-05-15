import type { StoredCharacter } from '@/types';
import { getServerSession } from 'next-auth/next';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { redisGet, redisSet } from '@/lib/redis';
import { POST } from '../route';

vi.mock('next-auth/next', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/redis', () => ({ redisGet: vi.fn(), redisSet: vi.fn() }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

const char: StoredCharacter = {
  name: 'Jumbaa',
  realmName: 'Ysondre',
  realmSlug: 'ysondre',
  region: 'EU',
  class: 'Druid',
};

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/user/favourites', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.mocked(getServerSession).mockResolvedValue({ user: { name: 'Jumbaa#1234' } } as never);
  vi.mocked(redisGet).mockResolvedValue(null);
  vi.mocked(redisSet).mockResolvedValue(undefined);
});

describe('pOST /api/user/favourites', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST(makeRequest(char));
    expect(res.status).toBe(401);
  });

  it('adds character to empty favourites', async () => {
    const res = await POST(makeRequest(char));
    const body = (await res.json()) as { favourites: StoredCharacter[] };
    expect(res.status).toBe(200);
    expect(body.favourites).toHaveLength(1);
    expect(body.favourites[0].name).toBe('Jumbaa');
    expect(vi.mocked(redisSet)).toHaveBeenCalled();
  });

  it('removes character that is already favourited (toggle)', async () => {
    vi.mocked(redisGet).mockResolvedValue(JSON.stringify([char]));
    const res = await POST(makeRequest(char));
    const body = (await res.json()) as { favourites: StoredCharacter[] };
    expect(body.favourites).toHaveLength(0);
  });

  it('adds new character to existing list', async () => {
    const other: StoredCharacter = { ...char, name: 'Altchar', realmSlug: 'hyjal' };
    vi.mocked(redisGet).mockResolvedValue(JSON.stringify([other]));
    const res = await POST(makeRequest(char));
    const body = (await res.json()) as { favourites: StoredCharacter[] };
    expect(body.favourites).toHaveLength(2);
  });

  it('is case-insensitive for deduplication', async () => {
    const upperChar = { ...char, name: 'JUMBAA', realmSlug: 'YSONDRE', region: 'EU' };
    vi.mocked(redisGet).mockResolvedValue(JSON.stringify([char]));
    const res = await POST(makeRequest(upperChar));
    const body = (await res.json()) as { favourites: StoredCharacter[] };
    expect(body.favourites).toHaveLength(0);
  });
});
