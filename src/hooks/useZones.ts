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
  }, [enabled]);

  return { zones, loading, error };
}
