'use client';

import type { StoredCharacter } from '@/types';
import { useCallback, useEffect, useState } from 'react';

function charKey(c: StoredCharacter) {
  return `${c.name.toLowerCase()}-${c.realmSlug.toLowerCase()}-${c.region.toLowerCase()}`;
}

export function usePreferences() {
  const [favourites, setFavourites] = useState<StoredCharacter[]>([]);
  const [recents, setRecents] = useState<StoredCharacter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch('/api/user/preferences')
      .then((r) => (r.ok ? r.json() : { favourites: [], recents: [] }))
      .then((data: unknown) => {
        const d = data as { favourites: StoredCharacter[]; recents: StoredCharacter[] };
        setFavourites(d.favourites ?? []);
        setRecents(d.recents ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const isFavourite = useCallback(
    (c: StoredCharacter) => favourites.some((f) => charKey(f) === charKey(c)),
    [favourites]
  );

  const toggleFavourite = useCallback((char: StoredCharacter) => {
    setFavourites((prev) => {
      const idx = prev.findIndex((c) => charKey(c) === charKey(char));
      return idx === -1 ? [...prev, char] : prev.filter((_, i) => i !== idx);
    });
    void fetch('/api/user/favourites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(char),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        if (data) setFavourites((data as { favourites: StoredCharacter[] }).favourites);
      })
      .catch(() => {});
  }, []);

  const addRecent = useCallback((char: StoredCharacter) => {
    setRecents((prev) => {
      const deduped = prev.filter((c) => charKey(c) !== charKey(char));
      return [char, ...deduped].slice(0, 5);
    });
    void fetch('/api/user/recents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(char),
    }).catch(() => {});
  }, []);

  return { favourites, recents, loading, isFavourite, toggleFavourite, addRecent };
}
