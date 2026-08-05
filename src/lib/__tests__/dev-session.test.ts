import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEV_SESSION_PROVIDER_ID,
  getDevSessionProviders,
  isDevSessionEnabled,
} from '@/lib/dev-session';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isDevSessionEnabled / getDevSessionProviders', () => {
  it('is inert when ENABLE_DEV_SESSION is unset, regardless of NODE_ENV', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ENABLE_DEV_SESSION', '');

    expect(isDevSessionEnabled()).toBe(false);
    expect(getDevSessionProviders()).toEqual([]);
  });

  it('is inert when NODE_ENV is production, even if ENABLE_DEV_SESSION=1', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ENABLE_DEV_SESSION', '1');

    expect(isDevSessionEnabled()).toBe(false);
    expect(getDevSessionProviders()).toEqual([]);
  });

  it('activates only when NODE_ENV is not production AND ENABLE_DEV_SESSION=1', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ENABLE_DEV_SESSION', '1');

    expect(isDevSessionEnabled()).toBe(true);
    const providers = getDevSessionProviders();
    expect(providers).toHaveLength(1);
    // next-auth's CredentialsProvider() factory returns { options: <raw user
    // options>, ... } — the top-level `id`/`name` are only merged in by
    // next-auth's internal request handling. Check the raw options we passed.
    expect(providers[0].options?.id).toBe(DEV_SESSION_PROVIDER_ID);
  });

  it('does not activate on a truthy-looking but non-"1" value', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ENABLE_DEV_SESSION', 'true');

    expect(isDevSessionEnabled()).toBe(false);
    expect(getDevSessionProviders()).toEqual([]);
  });
});
