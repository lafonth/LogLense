import { describe, expect, it } from 'vitest';
import { readApiError, retryAfterOf } from '../response-error';

function failure(status: number, body: unknown, headers?: Record<string, string>): Response {
  return {
    ok: false,
    status,
    headers: new Headers(headers),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('retryAfterOf', () => {
  it('se tait quand le serveur n’a pas donné d’échéance', () => {
    expect(retryAfterOf(failure(429, {}))).toBeNull();
  });

  it('rend les secondes en dessous de la minute', () => {
    expect(retryAfterOf(failure(429, {}, { 'Retry-After': '45' }))).toBe('45 seconds');
  });

  it('accorde le singulier', () => {
    expect(retryAfterOf(failure(429, {}, { 'Retry-After': '1' }))).toBe('1 second');
    expect(retryAfterOf(failure(429, {}, { 'Retry-After': '60' }))).toBe('1 minute');
  });

  // Vers le haut : revenir un peu trop tard ne coûte rien, revenir trop tôt redonne un 429.
  it('arrondit la minute entamée vers le haut', () => {
    expect(retryAfterOf(failure(429, {}, { 'Retry-After': '61' }))).toBe('2 minutes');
    expect(retryAfterOf(failure(429, {}, { 'Retry-After': '840' }))).toBe('14 minutes');
  });

  // Une date HTTP est une forme valide de l'en-tête, mais nos routes ne la posent pas : la
  // lire de travers annoncerait une échéance fausse, pire qu'une échéance tue.
  it('se tait sur ce qu’elle ne sait pas lire, plutôt que d’inventer un délai', () => {
    expect(retryAfterOf(failure(429, {}, { 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' }))).toBe(
      null
    );
    expect(retryAfterOf(failure(429, {}, { 'Retry-After': '0' }))).toBeNull();
    expect(retryAfterOf(failure(429, {}, { 'Retry-After': '-5' }))).toBeNull();
  });
});

describe('readApiError', () => {
  it('reprend le message du serveur', async () => {
    await expect(
      readApiError(failure(503, { error: 'Analysis temporarily unavailable' }))
    ).resolves.toBe('Analysis temporarily unavailable');
  });

  it('retombe sur le code HTTP quand le corps ne dit rien', async () => {
    await expect(readApiError(failure(502, {}))).resolves.toBe('HTTP 502');
  });

  it('retombe sur le code HTTP quand le corps n’est pas du JSON', async () => {
    const res = {
      ok: false,
      status: 500,
      headers: new Headers(),
      json: () => Promise.reject(new Error('not json')),
    } as unknown as Response;

    await expect(readApiError(res)).resolves.toBe('HTTP 500');
  });

  it('accroche l’échéance au message quand il y en a une', async () => {
    const res = failure(
      429,
      { error: 'Hourly Warcraft Logs quota reached' },
      {
        'Retry-After': '840',
      }
    );

    await expect(readApiError(res)).resolves.toBe(
      'Hourly Warcraft Logs quota reached — retry in 14 minutes.'
    );
  });
});
