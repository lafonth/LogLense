import { getServerSession } from 'next-auth';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEV_FIXTURE_CHARACTERS, DEV_STUB_ACCESS_TOKEN } from '@/lib/dev-session';
import { GET } from '../route';

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('gET /api/user/characters', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null as never);
    const res = await GET(new Request('http://localhost/api/user/characters'));
    expect(res.status).toBe(401);
  });

  it('returns fixture characters for the dev session stub without calling Blizzard', async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      accessToken: DEV_STUB_ACCESS_TOKEN,
      user: { name: 'DevUser#0000' },
    } as never);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const res = await GET(new Request('http://localhost/api/user/characters?region=EU'));
    const body = (await res.json()) as unknown[];

    expect(body).toEqual(DEV_FIXTURE_CHARACTERS);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
