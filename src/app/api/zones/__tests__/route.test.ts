import { beforeEach, describe, expect, it, vi } from 'vitest';

import { gql } from '@/lib/wcl/client';
import { GET } from '../route';

vi.mock('@/lib/wcl/auth', () => ({
  getWCLToken: vi.fn().mockResolvedValue('mock-token'),
}));

vi.mock('@/lib/wcl/client', () => ({
  gql: vi.fn(),
}));

const RAID_DIFFICULTIES = [{ id: 3 }, { id: 4 }, { id: 5 }];

const mockZonesResponse = {
  worldData: {
    zones: [
      {
        id: 38,
        name: 'Nerub-ar Palace',
        difficulties: RAID_DIFFICULTIES,
        encounters: [
          { id: 2902, name: 'Ulgrax the Devourer' },
          { id: 2917, name: 'The Bloodbound Horror' },
        ],
      },
      {
        id: 37,
        name: 'Aberrus, the Shadowed Crucible',
        difficulties: RAID_DIFFICULTIES,
        encounters: [{ id: 2522, name: 'Kazzara, the Hellforged' }],
      },
      {
        id: 36,
        name: 'M+ Season 1',
        difficulties: [{ id: 10 }],
        encounters: [{ id: 9999, name: 'Some Dungeon' }],
      },
      {
        id: 1,
        name: 'Empty Zone',
        difficulties: RAID_DIFFICULTIES,
        encounters: [],
      },
    ],
  },
};

describe('zones route', () => {
  beforeEach(() => {
    process.env.WCL_CLIENT_ID = 'test-id';
    process.env.WCL_CLIENT_SECRET = 'test-secret';
    vi.mocked(gql).mockResolvedValue(mockZonesResponse);
  });

  it('returns raid zones sorted newest first, excluding empty and non-raid zones', async () => {
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0].id).toBe(38);
    expect(body[1].id).toBe(37);
    expect(body.find((z: { id: number }) => z.id === 1)).toBeUndefined();
    expect(body.find((z: { id: number }) => z.id === 36)).toBeUndefined();
  });

  it('includes encounters in each zone', async () => {
    const res = await GET();
    const body = await res.json();

    expect(body[0].encounters).toHaveLength(2);
    expect(body[0].encounters[0].name).toBe('Ulgrax the Devourer');
  });

  it('returns 500 when credentials are missing', async () => {
    delete process.env.WCL_CLIENT_ID;
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns 500 when WCL throws', async () => {
    vi.mocked(gql).mockRejectedValue(new Error('WCL rate limit'));
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe('WCL rate limit');
  });
});
