import { useEffect, useRef, useState } from 'react';

export interface CharacterSuggestion {
  name: string;
  realmSlug: string;
  realmName: string;
}

interface FetchedResult {
  query: string;
  items: CharacterSuggestion[];
}

export function useCharacterSearch(query: string, region: string) {
  const [result, setResult] = useState<FetchedResult | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();

    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (trimmed.length < 2) return;

    timerRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);

      void fetch(`/api/search/character?q=${encodeURIComponent(trimmed)}&region=${region}`, {
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => setResult({ query: trimmed, items: data as CharacterSuggestion[] }))
        .catch((e) => {
          if ((e as Error).name !== 'AbortError') setResult({ query: trimmed, items: [] });
        })
        .finally(() => setLoading(false));
    }, 500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [query, region]);

  const trimmed = query.trim();
  const active = trimmed.length >= 2;
  // Only return results when they match the current query — stale results are hidden
  const suggestions = active && result?.query === trimmed ? result.items : [];

  return { suggestions, loading: active && loading };
}
