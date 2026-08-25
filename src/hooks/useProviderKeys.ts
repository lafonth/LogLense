'use client';

import type { Provider } from '@/lib/ai/catalog';

import { providerInfo } from '@/lib/ai/catalog';
import { useApiKey } from './useApiKey';

type KeyState = [string, (key: string) => void];

/**
 * Les clés personnelles des quatre fournisseurs, indexées par nom.
 *
 * Toutes lues à chaque rendu, et non celle du fournisseur actif seule : les hooks se comptent
 * par ordre d'appel, donc un `useApiKey` conditionnel décalerait tous les états suivants au
 * premier changement de fournisseur. C'est aussi ce qui permet de changer de fournisseur sans
 * perdre la clé qu'on venait de coller dans l'autre.
 */
export function useProviderKeys(): Record<Provider, KeyState> {
  const claude = useApiKey(providerInfo('claude').storageKey);
  const gemini = useApiKey(providerInfo('gemini').storageKey);
  const groq = useApiKey(providerInfo('groq').storageKey);
  const openai = useApiKey(providerInfo('openai').storageKey);

  return { claude, gemini, groq, openai };
}
