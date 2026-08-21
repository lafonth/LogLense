'use client';

import type { PullComparisonResult, PullPointer } from '@/lib/wcl/pull-pipeline';
import { useCallback, useState } from 'react';
import { readApiError } from '@/lib/api/response-error';

interface PullComparisonParams {
  specId: number;
  before: PullPointer;
  after: PullPointer;
}

export function usePullComparison() {
  const [result, setResult] = useState<PullComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async ({ specId, before, after }: PullComparisonParams) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/pull-comparison', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specId, before, after }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const data = (await res.json()) as PullComparisonResult;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  function reset() {
    setResult(null);
    setError(null);
  }

  return { result, loading, error, start, reset };
}
