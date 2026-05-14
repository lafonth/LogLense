import { TOKEN_URL } from './constants';

let cachedToken: string | null = null;
let cacheExpiresAt = 0;

export async function getWCLToken(clientId: string, clientSecret: string): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < cacheExpiresAt) return cachedToken;

  const credentials = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    throw new Error(`WCL auth failed: ${res.status}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = data.access_token;
  // Refresh 60 s before expiry; default to 55 min if expires_in absent
  const ttlMs = ((data.expires_in ?? 3600) - 60) * 1000;
  cacheExpiresAt = now + ttlMs;
  return cachedToken;
}
