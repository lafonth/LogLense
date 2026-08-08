import type { RaidRanking } from '@/lib/wcl/raid-ranking';
import { useState } from 'react';

/**
 * Le classement d'un combat. Un seul appel, déclenché quand on choisit une pull.
 *
 * `fetchedFightID` sert au rendu : sans lui, un classement d'une pull précédente resterait
 * affiché sous le titre d'une autre le temps de la requête.
 */
export function useRaidRanking() {
  const [ranking, setRanking] = useState<RaidRanking | null>(null);
  const [fetchedFightID, setFetchedFightID] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchRanking(code: string, fightID: number) {
    setLoading(true);
    setError(null);
    setRanking(null);
    setFetchedFightID(null);
    try {
      const res = await fetch(`/api/raid/${code}?fight=${fightID}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as RaidRanking;
      setRanking(data);
      setFetchedFightID(fightID);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setRanking(null);
    setFetchedFightID(null);
    setError(null);
  }

  return { ranking, fetchedFightID, loading, error, fetchRanking, reset };
}
