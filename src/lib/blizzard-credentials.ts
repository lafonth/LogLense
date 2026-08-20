/**
 * Les identifiants Blizzard du déploiement courant.
 *
 * Deux clients Battle.net existent — un par redirect URI, donc un par environnement — et le
 * code doit choisir. Le choix vivait en double : dans le fournisseur NextAuth, sous
 * `BLIZZARD_*_DEV` / `BLIZZARD_*_PROD`, et dans la recherche de royaume, sous un
 * `BLIZZARD_CLIENT_ID` sans suffixe qui n'était renseigné nulle part. La route n'a donc
 * jamais eu de jeton : elle rendait une liste de royaumes vide dans tous les environnements,
 * silencieusement, puisqu'elle avale son erreur.
 *
 * Un seul client sert les deux usages : le flux d'autorisation de la connexion et le
 * `client_credentials` des données de jeu. Un seul point de lecture, donc, pour que la paire
 * ne puisse plus diverger.
 *
 * Les valeurs peuvent être absentes — en développement local sans identifiants, ou dans un
 * test. C'est à l'appelant de décider ce qu'il en fait : le garde de démarrage refuse la
 * production sans elles, la recherche de royaume rend une liste vide.
 */
export function blizzardCredentials(env: NodeJS.ProcessEnv = process.env): {
  clientId: string | undefined;
  clientSecret: string | undefined;
} {
  const isProduction = env.VERCEL_ENV === 'production';
  return {
    clientId: isProduction ? env.BLIZZARD_CLIENT_ID_PROD : env.BLIZZARD_CLIENT_ID_DEV,
    clientSecret: isProduction ? env.BLIZZARD_CLIENT_SECRET_PROD : env.BLIZZARD_CLIENT_SECRET_DEV,
  };
}
