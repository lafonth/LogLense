import { useEffect, useRef, useState } from 'react';

export interface CharacterSuggestion {
  name: string;
  realmSlug: string;
  realmName: string;
}

export function useCharacterSearch(query: string, region: string) {
  const [suggestions, setSuggestions] = useState<CharacterSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const trimmed = query.trim();

    if (timerRef.current) clearTimeout(timerRef.current);

    if (trimmed.length < 2) return;

    timerRef.current = setTimeout(() => {
      setLoading(true);
      void fetch(`/api/search/character?q=${encodeURIComponent(trimmed)}&region=${region}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => setSuggestions(data as CharacterSuggestion[]))
        .catch(() => setSuggestions([]))
        .finally(() => setLoading(false));
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, region]);

  // Clear suggestions when query is too short — derived, not from effect
  const effectiveSuggestions = query.trim().length >= 2 ? suggestions : [];

  return { suggestions: effectiveSuggestions, loading };
}
