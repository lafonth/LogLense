import type { AnalysisResult, ReportActor, ReportFight } from '@/types';
import { useCallback, useState } from 'react';

interface ReportAnalysisParams {
  code: string;
  actor: ReportActor;
  difficulty: number;
  fights: ReportFight[];
}

export function useReportAnalysis() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async ({ code, actor, difficulty, fights }: ReportAnalysisParams) => {
    setLoading(true);
    setError(null);

    // For each encounter, collect kills at the given difficulty and pick the last one
    const encounterMap = new Map<
      number,
      { name: string; kills: { id: number; durationMs: number }[] }
    >();
    for (const f of fights) {
      if (!f.kill || f.difficulty !== difficulty || f.encounterID === 0) continue;
      if (!encounterMap.has(f.encounterID)) {
        encounterMap.set(f.encounterID, { name: f.name, kills: [] });
      }
      encounterMap.get(f.encounterID)!.kills.push({
        id: f.id,
        durationMs: f.endTime - f.startTime,
      });
    }

    const encounters = [...encounterMap.entries()].map(([id, { name, kills }]) => {
      const last = kills[kills.length - 1];
      return { id, name, fightId: last.id, fightMs: last.durationMs };
    });

    if (encounters.length === 0) {
      setError('No kills found for the selected difficulty in this report.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/report/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          actorId: actor.id,
          actorName: actor.name,
          difficulty,
          encounters,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as AnalysisResult;
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
