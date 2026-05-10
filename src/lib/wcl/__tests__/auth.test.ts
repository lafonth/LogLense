import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getWCLToken } from '../auth';

describe('getWCLToken', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns access token on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'test-token-123' }),
    } as Response);

    const token = await getWCLToken('client-id', 'client-secret');

    expect(token).toBe('test-token-123');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://www.warcraftlogs.com/oauth/token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
        }),
      })
    );
  });

  it('throws on HTTP error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    await expect(getWCLToken('bad', 'creds')).rejects.toThrow('WCL auth failed: 401');
  });
});
