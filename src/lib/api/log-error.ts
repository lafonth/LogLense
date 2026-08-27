/**
 * Ce qu'une route écrit dans les logs runtime quand elle échoue.
 *
 * Il n'y avait rien : zéro `console.error` dans `src/app/api`, aucun Sentry, aucun PostHog. Un
 * bêta-testeur qui prend un 500 laisse donc un message d'erreur à l'écran et rien du tout de
 * notre côté — pas de trace, pas d'heure, pas de route. La seule reprise possible est de lui
 * demander de refaire le geste en regardant par-dessus son épaule.
 *
 * Les logs runtime Vercel sont consultables et gratuits. Une ligne par échec, préfixée d'un
 * marqueur fixe pour être greppable, suffit à corréler « ça a planté vers 21 h » avec la panne
 * réelle. C'est délibérément le minimum : un service d'observabilité est une décision de coût et
 * de traitement de données personnelles, celle-ci n'en est pas une.
 *
 * **Trois familles de `catch` restent muettes, chacune pour sa raison :**
 *
 * - `JSON.parse` qui échoue et rend un 400. C'est une faute du client, pas la nôtre, et un
 *   client peut la répéter autant qu'il veut — la consigner offrirait à n'importe qui un moyen
 *   d'écrire dans nos logs.
 * - `hashUserId` qui jette faute de `LABEL_SALT`. `assertProductionEnv` l'exige au démarrage,
 *   donc en production le processus ne démarre pas plutôt que d'échouer requête par requête.
 *   L'échec bruyant est déjà là, et il est mieux placé.
 * - Les `catch(() => {})` des écritures de corpus **non bloquantes**, qui ont leur propre
 *   contrat : elles ne doivent jamais faire tomber l'écran qu'elles observent, et une ligne de
 *   log par requête servie les rendrait plus bruyantes que la panne. Les écritures **bloquantes**
 *   des deux routes `labels/`, elles, sont consignées : le corpus est l'actif, et une capture
 *   perdue ne se rattrape pas — le joueur ne reviendra pas donner deux fois le même verdict.
 */

/** Au-delà, le message est tronqué : une stack de GraphQL entière noierait la ligne. */
const MAX_MESSAGE_CHARS = 300;

/**
 * Toute suite d'au moins trente-deux caractères de jeton est remplacée avant d'être écrite.
 *
 * Aucune de nos routes ne met de secret dans une URL — les jetons Warcraft Logs et Blizzard
 * passent par un en-tête `Authorization`. C'est donc une ceinture, pas une bretelle : le jour où
 * un amont recopie une requête entière dans son message d'erreur, la ligne de log est déjà
 * propre. Le coût de se tromper dans l'autre sens est un secret déposé en clair dans un journal
 * qu'on ne purge pas.
 */
const SECRET_LIKE = /[\w-]{32,}/g;

function describe(error: unknown): string {
  const raw =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : `non-Error thrown (${typeof error})`;

  const redacted = raw.replace(SECRET_LIKE, '[redacted]');
  return redacted.length > MAX_MESSAGE_CHARS
    ? `${redacted.slice(0, MAX_MESSAGE_CHARS)}…`
    : redacted;
}

/**
 * Consigne l'échec d'une route, sous un marqueur fixe et sans rien qui identifie l'appelant.
 *
 * `route` est une étiquette libre et non une union fermée, contrairement à `WclRoute` : rien de
 * durable ne l'indexe, elle ne sert qu'à filtrer un flux de logs éphémère.
 *
 * **Aucune identité n'y entre** — ni adresse, ni battletag, ni empreinte de compte. Ce que ces
 * lignes servent à retrouver, c'est une panne, pas un utilisateur ; et la corrélation par compte
 * a déjà son support, le corpus, qui lui ne stocke que des empreintes salées.
 *
 * Muet sous `NODE_ENV=test` : les suites qui exercent volontairement les chemins d'échec
 * cracheraient une ligne par cas, et l'erreur y est déjà visible dans l'assertion.
 */
export function logRouteError(route: string, error: unknown): void {
  if (process.env.NODE_ENV === 'test') return;
  console.error(`[route-error] ${route} ${describe(error)}`);
}
