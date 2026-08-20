import { describe, expect, it } from 'vitest';
import { blizzardCredentials } from '@/lib/blizzard-credentials';

const ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  BLIZZARD_CLIENT_ID_DEV: 'dev-id',
  BLIZZARD_CLIENT_SECRET_DEV: 'dev-secret',
  BLIZZARD_CLIENT_ID_PROD: 'prod-id',
  BLIZZARD_CLIENT_SECRET_PROD: 'prod-secret',
};

describe('blizzardCredentials', () => {
  it('takes the production pair when VERCEL_ENV is production', () => {
    expect(blizzardCredentials({ ...ENV, VERCEL_ENV: 'production' })).toEqual({
      clientId: 'prod-id',
      clientSecret: 'prod-secret',
    });
  });

  // Preview et development sont deux environnements Vercel distincts, mais un seul client
  // Battle.net : tout ce qui n'est pas la production partage la redirect URI de dev.
  it.each(['preview', 'development', undefined])(
    'takes the dev pair when VERCEL_ENV is %s',
    (v) => {
      expect(blizzardCredentials({ ...ENV, VERCEL_ENV: v })).toEqual({
        clientId: 'dev-id',
        clientSecret: 'dev-secret',
      });
    }
  );

  // L'absence n'est pas une erreur ici : le garde de démarrage refuse la production sans ces
  // valeurs, et la recherche de royaume rend une liste vide. Rendre `undefined` sans jeter est
  // ce qui laisse ces deux décisions à l'appelant.
  it('returns undefined rather than throwing when the pair is absent', () => {
    expect(blizzardCredentials({ NODE_ENV: 'test' })).toEqual({
      clientId: undefined,
      clientSecret: undefined,
    });
  });
});
