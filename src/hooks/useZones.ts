'use client';

import type { Zone } from '@/types';
import { useEffect, useState } from 'react';

export function useZones() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, []);

  return { zones, loading, error };
}
