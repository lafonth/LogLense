import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logRouteError } from '../log-error';

const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

/** La seule ligne écrite par l'appel qui vient d'avoir lieu. */
function line(): string {
  return String(consoleError.mock.calls[0]?.[0] ?? '');
}

beforeEach(() => {
  vi.clearAllMocks();
  // Le module se tait sous `NODE_ENV=test`, ce qui est justement l'environnement d'ici : les
  // suites de routes exercent volontairement leurs chemins d'échec. On le lève pour observer.
  vi.stubEnv('NODE_ENV', 'production');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('logRouteError', () => {
  // Le marqueur est ce qui rend le flux exploitable : les logs runtime Vercel mêlent tout, et
  // sans préfixe fixe il n'y a pas de filtre à donner à un bêta-testeur qui rapporte une heure.
  it('writes one greppable line, carrying the route and the cause', () => {
    logRouteError('analyze', new Error('boom'));

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(line()).toContain('[route-error]');
    expect(line()).toContain('analyze');
    expect(line()).toContain('Error: boom');
  });

  // Un `throw 'oops'` ou un rejet de promesse non-Error ne doit pas produire `undefined:
  // undefined` : la ligne perdrait sa seule information.
  it('says so when what was thrown is not an Error', () => {
    logRouteError('zones', 'oops');

    expect(line()).toContain('non-Error thrown (string)');
  });

  // Ceinture, pas bretelle : aucune de nos routes ne met de jeton dans une URL. Le jour où un
  // amont recopie une requête entière dans son message, le journal — qu'on ne purge pas —
  // resterait propre.
  it('redacts anything long enough to be a token', () => {
    logRouteError('report', new Error('401 for token abcdefghijklmnopqrstuvwxyz0123456789'));

    expect(line()).not.toContain('abcdefghijklmnopqrstuvwxyz0123456789');
    expect(line()).toContain('[redacted]');
  });

  it('truncates a message long enough to drown the line', () => {
    logRouteError('analyze', new Error('x '.repeat(400)));

    expect(line().length).toBeLessThan(400);
    expect(line()).toContain('…');
  });

  // La corrélation par compte a déjà son support — le corpus, qui ne stocke que des empreintes
  // salées. Ces lignes-ci servent à retrouver une panne, pas un utilisateur.
  it('takes no identity: what it writes is exactly the route and the cause', () => {
    logRouteError('chat', new Error('failed'));

    expect(consoleError).toHaveBeenCalledWith('[route-error] chat Error: failed');
  });

  // Les suites de routes exercent leurs chemins d'échec par dizaines : une ligne par cas
  // noierait la sortie de test, alors que l'erreur y est déjà visible dans l'assertion.
  it('stays silent under NODE_ENV=test', () => {
    vi.stubEnv('NODE_ENV', 'test');

    logRouteError('analyze', new Error('boom'));

    expect(consoleError).not.toHaveBeenCalled();
  });
});
