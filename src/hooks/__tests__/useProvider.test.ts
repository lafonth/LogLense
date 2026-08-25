import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_PROVIDERS, PROVIDERS } from '@/lib/ai/catalog';
import { useProvider } from '../useProvider';

// L'environnement DOM des tests n'expose pas `localStorage` : sans ce double, le hook
// échouerait sur l'absence du stockage plutôt que sur ce qu'on cherche à vérifier.
function fakeStorage() {
  const entries = new Map<string, string>();
  return {
    getItem: (k: string) => entries.get(k) ?? null,
    setItem: (k: string, v: string) => void entries.set(k, v),
    removeItem: (k: string) => void entries.delete(k),
    clear: () => entries.clear(),
  };
}

let storage: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  storage = fakeStorage();
  vi.stubGlobal('localStorage', storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const useReport = () => useProvider('loglense_ai_provider', PROVIDERS, 'groq');
const useChat = () => useProvider('loglense_chat_provider', CHAT_PROVIDERS, 'claude');

describe('useProvider', () => {
  it('starts on the free tier when nothing has been chosen', () => {
    const { result } = renderHook(useReport);

    expect(result.current[0]).toBe('groq');
  });

  it('restores the provider chosen in a previous session', () => {
    storage.setItem('loglense_ai_provider', 'claude');

    const { result } = renderHook(useReport);

    expect(result.current[0]).toBe('claude');
  });

  it('persists a new choice so it survives a reload', () => {
    const { result } = renderHook(useReport);

    act(() => result.current[1]('gemini'));

    expect(result.current[0]).toBe('gemini');
    expect(storage.getItem('loglense_ai_provider')).toBe('gemini');
  });

  it('keeps its own key, so the chat does not inherit the report choice', () => {
    storage.setItem('loglense_ai_provider', 'gemini');

    const { result } = renderHook(useChat);

    expect(result.current[0]).toBe('claude');
  });

  // Groq n'a pas d'outils : la route de chat le refuse en 400. Un choix stocké hors de la liste
  // admissible doit donc retomber sur le repli, pas ouvrir le chat sur un fournisseur refusé.
  it('falls back when the stored provider is not allowed here', () => {
    storage.setItem('loglense_chat_provider', 'groq');

    const { result } = renderHook(useChat);

    expect(result.current[0]).toBe('claude');
  });
});
