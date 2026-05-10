import { API_URL } from './constants';

export async function gql<T>(
  token: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, ...(variables ? { variables } : {}) }),
  });

  if (!res.ok) {
    throw new Error(`WCL request failed: ${res.status}`);
  }

  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };

  if (body.errors?.length) {
    throw new Error(`WCL GraphQL error: ${body.errors[0].message}`);
  }

  return body.data as T;
}
