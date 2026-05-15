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
