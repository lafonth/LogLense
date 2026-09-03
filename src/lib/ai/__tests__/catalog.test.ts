import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHAT_PROVIDERS, DEFAULT_OFFERED, offeredProviders, servableProviders } from '../catalog';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('offeredProviders', () => {
  it('ne propose que Claude tant que rien ne nomme autre chose', () => {
    expect(offeredProviders()).toEqual(DEFAULT_OFFERED);
  });

  it('ouvre le catalogue nom par nom, dans l’ordre où la variable les nomme', () => {
    vi.stubEnv('AI_PROVIDERS', 'openai, claude');

    expect(offeredProviders()).toEqual(['openai', 'claude']);
  });

  // Une faute de frappe dans une variable d'environnement ne doit ni ouvrir le catalogue entier
  // ni fermer les routes : le nom inconnu tombe, les autres passent.
  it('ignore un nom inconnu sans emporter ceux qui l’entourent', () => {
    vi.stubEnv('AI_PROVIDERS', 'claude,mistral');

    expect(offeredProviders()).toEqual(['claude']);
  });

  it('retombe sur le défaut quand la variable ne nomme rien de connu', () => {
    vi.stubEnv('AI_PROVIDERS', 'mistral, ,llama');

    expect(offeredProviders()).toEqual(DEFAULT_OFFERED);
  });

  it('ne nomme pas deux fois le même fournisseur', () => {
    vi.stubEnv('AI_PROVIDERS', 'claude,claude');

    expect(offeredProviders()).toEqual(['claude']);
  });
});

describe('servableProviders', () => {
  it('écarte l’offert sans clé — le proposer serait proposer un 503', () => {
    vi.stubEnv('AI_PROVIDERS', 'claude,gemini');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant');
    vi.stubEnv('GEMINI_API_KEY', '');

    expect(servableProviders()).toEqual(['claude']);
  });

  it('écarte le muni de sa clé mais hors de l’offre', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant');
    vi.stubEnv('OPENAI_API_KEY', 'sk-openai');

    expect(servableProviders()).toEqual(['claude']);
  });

  // Le chat passe sa propre liste : Groq sert le rapport et jamais le chat, faute de
  // `streamTurn`.
  it('n’admet au chat que les fournisseurs outillés', () => {
    vi.stubEnv('AI_PROVIDERS', 'groq,claude');
    vi.stubEnv('GROQ_API_KEY', 'gsk');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant');

    expect(servableProviders()).toEqual(['groq', 'claude']);
    expect(servableProviders(CHAT_PROVIDERS)).toEqual(['claude']);
  });

  it('rend une liste vide plutôt qu’un fournisseur sans clé', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');

    expect(servableProviders()).toEqual([]);
  });
});
