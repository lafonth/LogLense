import { describe, expect, it } from 'vitest';
import { assertProductionEnv } from '@/lib/startup-check';

function fullEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    WCL_CLIENT_ID: 'id',
    WCL_CLIENT_SECRET: 'secret',
    NEXTAUTH_SECRET: 'nextauth-secret',
    BLIZZARD_CLIENT_ID_PROD: 'bnet-id',
    BLIZZARD_CLIENT_SECRET_PROD: 'bnet-secret',
    UPSTASH_REDIS_REST_URL: 'https://redis.example',
    UPSTASH_REDIS_REST_TOKEN: 'redis-token',
    LABEL_SALT: 'salt',
    ...overrides,
  } as NodeJS.ProcessEnv;
}

describe('assertProductionEnv', () => {
  it('passes when every required variable is set and the dev stub is absent', () => {
    expect(() => assertProductionEnv(fullEnv())).not.toThrow();
  });

  it('fails at startup when a required variable is missing, naming it', () => {
    expect(() => assertProductionEnv(fullEnv({ LABEL_SALT: undefined }))).toThrow(/LABEL_SALT/);
  });

  it('fails when several required variables are missing at once', () => {
    expect(() =>
      assertProductionEnv(fullEnv({ WCL_CLIENT_ID: undefined, LABEL_SALT: undefined }))
    ).toThrow(/WCL_CLIENT_ID.*LABEL_SALT/s);
  });

  // Un commentaire dans `.env.example` n'empêche personne de le régler par erreur en prod.
  it('fails when the dev session stub is enabled', () => {
    expect(() => assertProductionEnv(fullEnv({ ENABLE_DEV_SESSION: '1' }))).toThrow(
      /ENABLE_DEV_SESSION/
    );
  });
});
