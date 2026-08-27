import type { ReportMeta } from '@/types';
import { useState } from 'react';
import { readApiError } from '@/lib/api/response-error';
import { getCachedReportMeta, setCachedReportMeta } from '@/lib/report-meta-cache';

export function useReportMeta() {
  const [meta, setMeta] = useState<ReportMeta | null>(null);
  const [fetchedCode, setFetchedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchMeta(code: string) {
    // Le formulaire vient peut-être de la demander : la route de résultat la retrouve alors
    // sans une seconde requête WCL. Voir `src/lib/report-meta-cache.ts`.
    const cached = getCachedReportMeta(code);
    if (cached) {
      setMeta(cached);
      setFetchedCode(code);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setMeta(null);
    setFetchedCode(null);
    try {
      const res = await fetch(`/api/report/${code}`);
      if (!res.ok) throw new Error(await readApiError(res));
      const data = (await res.json()) as ReportMeta;
      setCachedReportMeta(code, data);
      setMeta(data);
      setFetchedCode(code);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setMeta(null);
    setFetchedCode(null);
    setError(null);
  }

  return { meta, fetchedCode, loading, error, fetchMeta, reset };
}
