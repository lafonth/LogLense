'use client';

import type { Zone } from '@/types';
import { useEffect, useState } from 'react';

/**
 * `enabled` existe parce que `/api/zones` demande désormais une session : appelée par un
 * visiteur déconnecté, la route rend 401 et la page d'accueil afficherait une erreur de
 * chargement des raids sous une invitation à se connecter. L'appelant sait s'il y a une
 * session ; le hook, lui, ne peut pas le demander — `useSession` jette hors d'un
 * `SessionProvider`, ce qui le rendrait intestable et casserait tout appelant qui n'en a pas.
 */
export function useZones(enabled = true) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Compteur de tentatives : la seule sortie d'une erreur était de recharger la page, alors
  // que `/api/zones` échoue surtout de façon passagère — WCL indisponible, réseau coupé.
  const [attempt, setAttempt] = useState(0);
  // La remise à zéro se fait pendant le rendu, pas dans l'effet : sinon le rendu qui suit
  // le clic sur Retry affiche encore l'ancienne erreur, et c'est précisément l'écran que
  // l'utilisateur vient de demander à quitter.
  const [syncedAttempt, setSyncedAttempt] = useState(0);
  if (attempt !== syncedAttempt) {
    setSyncedAttempt(attempt);
    setLoading(true);
    setError(null);
  }

  useEffect(() => {
    if (!enabled) return;

    fetch('/api/zones')
      .then((r) => r.json())
      .then((data: Zone[] | { error: string }) => {
        if ('error' in data) throw new Error(data.error);
        setZones(data);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load raids');
      })
      .finally(() => setLoading(false));
  }, [enabled, attempt]);

  return { zones, loading, error, retry: () => setAttempt((n) => n + 1) };
}
