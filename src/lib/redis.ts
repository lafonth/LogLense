const BASE = process.env.UPSTASH_REDIS_REST_URL ?? '';
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? '';

async function exec<T>(cmd: unknown[]): Promise<T> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
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
