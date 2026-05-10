import { TOKEN_URL } from './constants';

export async function getWCLToken(clientId: string, clientSecret: string): Promise<string> {
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

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}
