import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useApiKey } from '../useApiKey';

const DEFAULT_KEY = 'loglense_api_key';

// L'environnement DOM des tests n'expose pas `localStorage` : sans ce double, le hook
// échouerait sur l'absence du stockage plutôt que sur ce qu'on cherche à vérifier.
// `setItem` et `removeItem` sont espionnés parce qu'ici les deux ne sont pas
// interchangeables : effacer la clé doit retirer l'entrée, pas en écrire une vide.
function fakeStorage() {
  const entries = new Map<string, string>();
  return {
    getItem: (k: string) => entries.get(k) ?? null,
    setItem: vi.fn((k: string, v: string) => void entries.set(k, v)),
    removeItem: vi.fn((k: string) => void entries.delete(k)),
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

describe('useApiKey', () => {
  it('starts empty when nothing was ever stored', () => {
    const { result } = renderHook(() => useApiKey());

    expect(result.current[0]).toBe('');
  });

  it('reads back what a previous session stored', () => {
    storage.setItem(DEFAULT_KEY, 'sk-ant-stored');
    const { result } = renderHook(() => useApiKey());

    expect(result.current[0]).toBe('sk-ant-stored');
  });

  it('persists the key it is handed', () => {
    const { result } = renderHook(() => useApiKey());

    act(() => {
      result.current[1]('sk-ant-new');
    });

    expect(result.current[0]).toBe('sk-ant-new');
    expect(storage.getItem(DEFAULT_KEY)).toBe('sk-ant-new');
  });

  /**
   * Clearing the field is how a user stops trusting this browser with the key. Writing an
   * empty string instead of removing would leave the entry sitting there.
   */
  it('removes the entry when the key is cleared, rather than storing an empty one', () => {
    storage.setItem(DEFAULT_KEY, 'sk-ant-stored');
    const { result } = renderHook(() => useApiKey());
    storage.setItem.mockClear();

    act(() => {
      result.current[1]('');
    });

    expect(result.current[0]).toBe('');
    expect(storage.getItem(DEFAULT_KEY)).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(DEFAULT_KEY);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('keeps two storage keys apart', () => {
    const anthropic = renderHook(() => useApiKey('loglense_anthropic_key'));
    const openai = renderHook(() => useApiKey('loglense_openai_key'));

    act(() => {
      anthropic.result.current[1]('sk-ant');
    });

    expect(storage.getItem('loglense_anthropic_key')).toBe('sk-ant');
    expect(openai.result.current[0]).toBe('');
    expect(storage.getItem('loglense_openai_key')).toBeNull();
  });

  /** The initial read is a lazy initialiser: it runs once, not on every render. */
  it('does not re-read storage on a later render', () => {
    const { result, rerender } = renderHook(() => useApiKey());
    storage.setItem(DEFAULT_KEY, 'sk-ant-written-elsewhere');

    rerender();

    expect(result.current[0]).toBe('');
  });
});
