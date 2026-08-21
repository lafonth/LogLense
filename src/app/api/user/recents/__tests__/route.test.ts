import type { StoredCharacter } from '@/types';
import { getServerSession } from 'next-auth/next';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { redisGet, redisSet } from '@/lib/redis';
import { POST } from '../route';

vi.mock('next-auth/next', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/redis', () => ({ redisGet: vi.fn(), redisSet: vi.fn() }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

function makeChar(name: string, realmSlug = 'ysondre'): StoredCharacter {
  return { name, realmName: 'Ysondre', realmSlug, region: 'EU', class: 'Druid' };
}

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/user/recents', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.mocked(getServerSession).mockResolvedValue({ user: { name: 'Jumbaa#1234' } } as never);
  vi.mocked(redisGet).mockResolvedValue(null);
  vi.mocked(redisSet).mockClear().mockResolvedValue(undefined);
});

describe('pOST /api/user/recents', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST(makeRequest(makeChar('Jumbaa')));
    expect(res.status).toBe(401);
  });

  it('prepends character to empty recents', async () => {
    const res = await POST(makeRequest(makeChar('Jumbaa')));
    const body = (await res.json()) as { recents: StoredCharacter[] };
    expect(body.recents[0].name).toBe('Jumbaa');
  });

  it('moves existing character to front instead of duplicating', async () => {
    const existing = [makeChar('Jumbaa'), makeChar('Altchar')];
    vi.mocked(redisGet).mockResolvedValue(JSON.stringify(existing));
    const res = await POST(makeRequest(makeChar('Altchar')));
    const body = (await res.json()) as { recents: StoredCharacter[] };
    expect(body.recents[0].name).toBe('Altchar');
    expect(body.recents).toHaveLength(2);
  });

  it('caps list at 5 entries', async () => {
    const existing = Array.from({ length: 5 }, (_, i) => makeChar(`Char${i}`));
    vi.mocked(redisGet).mockResolvedValue(JSON.stringify(existing));
    const res = await POST(makeRequest(makeChar('NewChar')));
    const body = (await res.json()) as { recents: StoredCharacter[] };
    expect(body.recents).toHaveLength(5);
    expect(body.recents[0].name).toBe('NewChar');
  });

  // Les deux mêmes défauts que sur les favoris, sur la même clé et la même forme : le corps
  // entrait sans contrôle, et la liste stockée était relue par un `JSON.parse` nu.
  it('returns 400 on a character without a realmSlug, without writing', async () => {
    const res = await POST(
      makeRequest({ name: 'Jumbaa', realmName: 'Ysondre', region: 'EU', class: 'Druid' })
    );
    expect(res.status).toBe(400);
    expect(redisSet).not.toHaveBeenCalled();
  });

  it('recovers from an unreadable stored list rather than throwing', async () => {
    vi.mocked(redisGet).mockResolvedValue('{ not json');
    const res = await POST(makeRequest(makeChar('Jumbaa')));
    const body = (await res.json()) as { recents: StoredCharacter[] };
    expect(res.status).toBe(200);
    expect(body.recents.map((c) => c.name)).toEqual(['Jumbaa']);
  });

  // Une entrée écrite par une version antérieure du code peut ne plus avoir la forme
  // d'aujourd'hui : elle sort de la liste, elle n'emporte pas la requête.
  it('drops the stored entries that no longer have the expected shape', async () => {
    vi.mocked(redisGet).mockResolvedValue(
      JSON.stringify([{ name: 'Legacy' }, makeChar('Altchar')])
    );
    const res = await POST(makeRequest(makeChar('Jumbaa')));
    const body = (await res.json()) as { recents: StoredCharacter[] };
    expect(body.recents.map((c) => c.name)).toEqual(['Jumbaa', 'Altchar']);
  });
});
