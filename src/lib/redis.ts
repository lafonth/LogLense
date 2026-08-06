async function exec<T>(cmd: unknown[]): Promise<T> {
  const base = process.env.UPSTASH_REDIS_REST_URL ?? '';
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? '';
  const res = await fetch(base, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
    cache: 'no-store',
  });
  const data = (await res.json()) as { result: T };
  return data.result;
}

export async function redisGet(key: string): Promise<string | null> {
  return exec<string | null>(['GET', key]);
}

export async function redisSet(key: string, value: string): Promise<void> {
  await exec(['SET', key, value]);
}

/**
 * Ajoute en fin de liste. Append-only : pas de lecture préalable, donc deux écritures
 * concurrentes ne peuvent pas s'écraser l'une l'autre — ce que le read-modify-write des
 * routes `user/*` ne garantit pas, et qu'un corpus non reconstituable ne peut pas se
 * permettre.
 *
 * `exec` ne vérifie pas `res.ok` ; on valide donc ici que Redis a bien rendu une longueur,
 * faute de quoi une écriture échouée passerait pour un succès.
 */
export async function redisAppend(key: string, value: string): Promise<number> {
  const length = await exec<number | null>(['RPUSH', key, value]);
  if (typeof length !== 'number' || !Number.isFinite(length)) {
    throw new TypeError(`RPUSH ${key} did not return a list length`);
  }
  return length;
}
