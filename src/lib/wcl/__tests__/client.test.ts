import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gql } from '../client';

describe('gql', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns data on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { worldData: { encounter: {} } } }),
    } as Response);

    const result = await gql<{ worldData: unknown }>('token', '{ worldData { encounter } }');
    expect(result).toEqual({ worldData: { encounter: {} } });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://www.warcraftlogs.com/api/v2/client',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      })
    );
  });

  it('throws on GraphQL errors array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ errors: [{ message: 'Not found' }] }),
    } as Response);

    await expect(gql('token', 'query {}')).rejects.toThrow('WCL GraphQL error');
  });

  it('throws on HTTP error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429 } as Response);
    await expect(gql('token', 'query {}')).rejects.toThrow('WCL request failed: 429');
  });
});
