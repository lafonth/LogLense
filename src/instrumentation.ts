/**
 * Next.js appelle `register()` une fois au démarrage du serveur, y compris pour le runtime
 * edge — d'où le filtre `NEXT_RUNTIME` : la vérification n'a de sens qu'une fois, côté Node.
 * `VERCEL_ENV` restreint le reste à un déploiement de production réel : le développement local
 * ne dispose ni des identifiants Blizzard de production ni de `LABEL_SALT`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.VERCEL_ENV !== 'production') return;
  const { assertProductionEnv } = await import('@/lib/startup-check');
  assertProductionEnv();
}
