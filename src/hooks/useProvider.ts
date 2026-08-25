'use client';

import type { Provider, ProviderInfo } from '@/lib/ai/catalog';

import { useState } from 'react';

export type { Provider };

/**
 * Le fournisseur d'IA choisi, retenu d'une session à l'autre.
 *
 * `fallback` doit être le fournisseur que le serveur rend : deux valeurs différentes rendaient
 * un `<Select>` sur Gemini au premier rendu puis sur Groq après hydratation, ce que React
 * signale comme une divergence — et l'utilisateur voyait le champ changer sous ses yeux.
 *
 * `allowed` borne ce qui est relu : le rapport accepte les quatre fournisseurs, le chat les
 * seuls outillés. Sans ce filtre, un `loglense_ai_provider` laissé sur `groq` par le rapport
 * ferait ouvrir le chat sur un fournisseur que la route refuse en 400.
 */
export function useProvider(
  storageKey: string,
  allowed: readonly ProviderInfo[],
  fallback: Provider
): [Provider, (p: Provider) => void] {
  const [provider, setProvider] = useState<Provider>(() => {
    if (typeof window === 'undefined') return fallback;
    const stored = localStorage.getItem(storageKey);
    return allowed.some((p) => p.id === stored) ? (stored as Provider) : fallback;
  });

  function persist(p: Provider) {
    setProvider(p);
    localStorage.setItem(storageKey, p);
  }

  return [provider, persist];
}
