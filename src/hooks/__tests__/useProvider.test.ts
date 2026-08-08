import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('useProvider', () => {
  it('starts on the free tier when nothing has been chosen', () => {
    const { result } = renderHook(() => useProvider());

    expect(result.current[0]).toBe('groq');
  });

  it('restores the provider chosen in a previous session', () => {
    storage.setItem('loglense_ai_provider', 'claude');

    const { result } = renderHook(() => useProvider());

    expect(result.current[0]).toBe('claude');
  });

  it('persists a new choice so it survives a reload', () => {
    const { result } = renderHook(() => useProvider());

    act(() => result.current[1]('gemini'));

    expect(result.current[0]).toBe('gemini');
    expect(storage.getItem('loglense_ai_provider')).toBe('gemini');
  });
});
