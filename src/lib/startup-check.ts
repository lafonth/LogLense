const REQUIRED_IN_PRODUCTION = [
  'WCL_CLIENT_ID',
  'WCL_CLIENT_SECRET',
  'NEXTAUTH_SECRET',
  'BLIZZARD_CLIENT_ID_PROD',
  'BLIZZARD_CLIENT_SECRET_PROD',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'LABEL_SALT',
] as const;

/**
 * Échoue au démarrage plutôt qu'au premier clic d'un raider : une variable manquante ou le
 * stub de session resté actif ne doivent jamais se découvrir en production.
 */
export function assertProductionEnv(env: NodeJS.ProcessEnv = process.env): void {
  const missing = REQUIRED_IN_PRODUCTION.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Variables d'environnement manquantes en production : ${missing.join(', ')}`);
  }
  if (env.ENABLE_DEV_SESSION) {
    throw new Error('ENABLE_DEV_SESSION ne doit jamais être présent en production.');
  }
}
