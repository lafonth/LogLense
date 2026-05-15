import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getWCLToken, clearTokenCache } from '../auth';

describe('getWCLToken', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearTokenCache();
  });

  it('returns access token on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'test-token-123' }),
    } as Response);

    const token = await getWCLToken('client-id', 'client-secret');

    expect(token).toBe('test-token-123');
    expect(globalThis.fetch).toHaveBeenCalledWith(
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
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    await expect(getWCLToken('bad', 'creds')).rejects.toThrow('WCL auth failed: 401');
  });
});
