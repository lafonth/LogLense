/**
 * Envoie une commande à Upstash et rend son résultat, ou jette.
 *
 * Le refus doit jeter, pas rendre `undefined`. Sans cette vérification, un jeton expiré ou
 * une URL absente rendaient un corps d'erreur dont `data.result` était `undefined`, et
 * chaque appelant lisait ce vide comme une réponse : la liste blanche de connexion voyait
 * « pas de clé » et ouvrait l'accès à tout le monde, indistinguable d'une liste jamais
 * configurée. Une panne de Redis ne doit pas pouvoir se faire passer pour un état.
 */
async function exec<T>(cmd: unknown[]): Promise<T> {
  const base = process.env.UPSTASH_REDIS_REST_URL ?? '';
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? '';
  const res = await fetch(base, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Redis ${String(cmd[0])} failed: ${res.status}`);
  }

  const data = (await res.json()) as { result?: T; error?: string };

  if (data.error !== undefined) {
    throw new Error(`Redis ${String(cmd[0])} failed: ${data.error}`);
  }

  return data.result as T;
}

export async function redisGet(key: string): Promise<string | null> {
  return exec<string | null>(['GET', key]);
}

export async function redisSet(key: string, value: string): Promise<void> {
  await exec(['SET', key, value]);
}

/**
 * Pose une valeur avec sa durée de vie, en une commande.
 *
 * Séparé de `redisSet` plutôt qu'ajouté en argument optionnel : ce qu'on écrit avec un TTL
 * est du cache, ce qu'on écrit sans est de la donnée. Deux fonctions obligent l'appelant à
 * nommer la durée à chaque site — un cache de réponses Warcraft Logs n'est légitime que
 * parce qu'il expire, et un `SET` sans expiration en ferait la base de données permanente
 * que les CGU refusent.
 */
export async function redisSetEx(key: string, value: string, ttlSeconds: number): Promise<void> {
  await exec(['SET', key, value, 'EX', String(ttlSeconds)]);
}

/**
 * Ajoute `amount` à un compteur et rend sa nouvelle valeur.
 *
 * Atomique côté Redis : c'est ce qui permet de compter juste alors que les route handlers
 * s'exécutent sur des instances indépendantes, où un compteur en mémoire ne compterait
 * qu'une fraction du trafic.
 *
 * Le pas est un paramètre parce que toutes les requêtes ne coûtent pas la même chose :
 * l'analyse d'un boss vaut une cinquantaine d'appels Warcraft Logs, la lecture d'une liste
 * de zones en vaut un. Compter les requêtes plafonnerait le nombre d'appels HTTP reçus,
 * pas la dépense qu'ils déclenchent.
 */
export async function redisIncrBy(key: string, amount: number): Promise<number> {
  const value = await exec<number | null>(['INCRBY', key, String(amount)]);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`INCRBY ${key} did not return a counter value`);
  }
  return value;
}

/**
 * Lit plusieurs clés en une commande, dans l'ordre demandé.
 *
 * Existe pour un seul appelant, et pour une raison précise : la fenêtre de vérification des
 * candidats fait treize clés de cache. Treize `GET` séquentiels rendraient au réseau ce que
 * le cache vient d'économiser chez Warcraft Logs.
 *
 * L'alignement des index est ce qui rend le résultat exploitable — l'appelant reconnaît une
 * valeur à sa position, pas à son contenu. Une réponse de longueur différente est donc une
 * panne, pas un résultat partiel : on jette, et le cache échoue ouvert chez l'appelant.
 */
export async function redisMGet(keys: string[]): Promise<(string | null)[]> {
  if (keys.length === 0) return [];

  const values = await exec<(string | null)[] | null>(['MGET', ...keys]);
  if (!Array.isArray(values) || values.length !== keys.length) {
    throw new TypeError(`MGET returned ${String(values?.length)} values for ${keys.length} keys`);
  }
  return values.map((value) => (typeof value === 'string' ? value : null));
}

/** Pose une durée de vie. Sans elle, un compteur de fenêtre ne se réinitialiserait jamais. */
export async function redisExpire(key: string, seconds: number): Promise<void> {
  await exec(['EXPIRE', key, String(seconds)]);
}

/** Longueur d'une liste. Sert à mesurer le corpus sans le lire. */
export async function redisLlen(key: string): Promise<number> {
  const length = await exec<number | null>(['LLEN', key]);
  return typeof length === 'number' && Number.isFinite(length) ? length : 0;
}

/**
 * Ajoute en fin de liste. Append-only : pas de lecture préalable, donc deux écritures
 * concurrentes ne peuvent pas s'écraser l'une l'autre — ce que le read-modify-write des
 * routes `user/*` ne garantit pas, et qu'un corpus non reconstituable ne peut pas se
 * permettre.
 *
 * `exec` jette sur un refus, mais un `RPUSH` accepté rend toujours une longueur : on la
 * valide ici, faute de quoi une réponse muette passerait pour une écriture réussie.
 */
export async function redisAppend(key: string, value: string): Promise<number> {
  const length = await exec<number | null>(['RPUSH', key, value]);
  if (typeof length !== 'number' || !Number.isFinite(length)) {
    throw new TypeError(`RPUSH ${key} did not return a list length`);
  }
  return length;
}

/**
 * Écrit un champ dans un hash. Rend `true` si le champ n'existait pas.
 *
 * Un hash plutôt qu'une liste JSON relue puis réécrite : la liste d'accès est lue à **chaque
 * connexion**, et un `HGET` répond en O(1) sans faire transiter la liste entière. Le
 * read-modify-write des routes `user/*` perdrait en plus une admission concurrente — ici deux
 * admissions simultanées touchent deux champs distincts et ne se voient pas.
 */
export async function redisHSet(key: string, field: string, value: string): Promise<boolean> {
  const added = await exec<number | null>(['HSET', key, field, value]);
  if (typeof added !== 'number' || !Number.isFinite(added)) {
    throw new TypeError(`HSET ${key} did not return a field count`);
  }
  return added > 0;
}

/** Lit un champ. `null` veut dire absent — un refus Redis jette, il n'arrive pas ici. */
export async function redisHGet(key: string, field: string): Promise<string | null> {
  return exec<string | null>(['HGET', key, field]);
}

/** Retire un champ. Rend `true` s'il existait. */
export async function redisHDel(key: string, field: string): Promise<boolean> {
  const removed = await exec<number | null>(['HDEL', key, field]);
  return typeof removed === 'number' && removed > 0;
}

/** Nombre de champs, sans lire le hash. Sert à plafonner une file sans la charger. */
export async function redisHLen(key: string): Promise<number> {
  const length = await exec<number | null>(['HLEN', key]);
  return typeof length === 'number' && Number.isFinite(length) ? length : 0;
}

/**
 * Lit un hash entier, replié en objet.
 *
 * Upstash rend `HGETALL` en REST comme un tableau plat — champ, valeur, champ, valeur — et
 * non comme un objet : le repli se fait ici, une fois, plutôt que chez chaque appelant. Une
 * longueur impaire est une panne de protocole, pas un résultat partiel : on jette.
 */
export async function redisHGetAll(key: string): Promise<Record<string, string>> {
  const flat = await exec<unknown>(['HGETALL', key]);
  if (flat === null || flat === undefined) return {};

  // Certains déploiements rendent déjà un objet. Les deux formes sont acceptées, la longueur
  // impaire ne l'est dans aucune.
  if (!Array.isArray(flat)) {
    if (typeof flat !== 'object') throw new TypeError(`HGETALL ${key} returned a scalar`);
    return Object.fromEntries(
      Object.entries(flat as Record<string, unknown>).map(([f, v]) => [f, String(v)])
    );
  }

  if (flat.length % 2 !== 0) {
    throw new TypeError(`HGETALL ${key} returned ${flat.length} entries, expected pairs`);
  }

  const out: Record<string, string> = {};
  for (let i = 0; i < flat.length; i += 2) {
    out[String(flat[i])] = String(flat[i + 1]);
  }
  return out;
}
