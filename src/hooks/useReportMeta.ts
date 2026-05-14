import type { ReportMeta } from '@/types';
import { useState } from 'react';

export function useReportMeta() {
  const [meta, setMeta] = useState<ReportMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchMeta(code: string) {
    setLoading(true);
    setError(null);
    setMeta(null);
    try {
      const res = await fetch(`/api/report/${code}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ReportMeta;
      setMeta(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setMeta(null);
    setError(null);
  }

  return { meta, loading, error, fetchMeta, reset };
}
