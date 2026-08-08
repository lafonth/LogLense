'use client';

import { useState } from 'react';

export type Provider = 'claude' | 'gemini' | 'groq';

/**
 * Le fournisseur d'IA choisi, retenu d'une session à l'autre.
 *
 * Le défaut est le même côté serveur et côté client : deux valeurs différentes rendaient
 * un `<Select>` sur Gemini au premier rendu puis sur Groq après hydratation, ce que React
 * signale comme une divergence — et l'utilisateur voyait le champ changer sous ses yeux.
 */
const DEFAULT_PROVIDER: Provider = 'groq';

export function useProvider(): [Provider, (p: Provider) => void] {
  const [provider, setProvider] = useState<Provider>(() => {
    if (typeof window === 'undefined') return DEFAULT_PROVIDER;
    return (localStorage.getItem('loglense_ai_provider') as Provider | null) ?? DEFAULT_PROVIDER;
  });

  function persist(p: Provider) {
    setProvider(p);
    localStorage.setItem('loglense_ai_provider', p);
  }

  return [provider, persist];
}
