'use client';

import type { useAnalysis } from './useAnalysis';
import type { useReportAnalysis } from './useReportAnalysis';
import type { useReportMeta } from './useReportMeta';
import type { AnalysisInput, ReportMeta, Zone  } from '@/types';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

function parseDifficulty(val: string | null): AnalysisInput['difficulty'] {
  const n = Number(val);
  return n === 3 || n === 4 || n === 5 ? n : 4;
}

interface UseRouteSyncParams {
  zones: Zone[];
  zonesLoading: boolean;
  reportMeta: ReportMeta | null;
  fetchedCode: string | null;
  reportMetaLoading: boolean;
  start: ReturnType<typeof useAnalysis>['start'];
  startReport: ReturnType<typeof useReportAnalysis>['start'];
  fetchMeta: ReturnType<typeof useReportMeta>['fetchMeta'];
}

export interface RouteParams {
  char: string | null;
  server: string | null;
  region: AnalysisInput['region'];
  difficulty: AnalysisInput['difficulty'];
  zoneId: number | null;
  reportCode: string | null;
  reportActorId: number | null;
  reportDifficulty: AnalysisInput['difficulty'];
  bossParam: number | null;
  clearCharKey: () => void;
  clearReportKey: () => void;
  setReportKey: (key: string) => void;
}

export function useRouteSync({
  zones,
  zonesLoading,
  reportMeta,
  fetchedCode,
  reportMetaLoading,
  start,
  startReport,
  fetchMeta,
}: UseRouteSyncParams): RouteParams {
  const searchParams = useSearchParams();

  const char = searchParams.get('char');
  const server = searchParams.get('server');
  const region = (searchParams.get('region') ?? 'EU') as AnalysisInput['region'];
  const difficulty = parseDifficulty(searchParams.get('difficulty'));
  const zoneId = Number(searchParams.get('zone')) || null;
  const reportCode = searchParams.get('report');
  const reportActorId = Number(searchParams.get('actor')) || null;
  const reportDifficulty = parseDifficulty(searchParams.get('difficulty'));
  const bossParam = Number(searchParams.get('boss')) || null;

  const lastKeyRef = useRef<string | null>(null);
  const lastReportKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!char || !server || zonesLoading || zones.length === 0) return;
    const zone = (zoneId ? zones.find((z) => z.id === zoneId) : null) ?? zones[0];
    if (!zone) return;
    const key = `${char}|${server}|${region}|${difficulty}|${zone.id}`;
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    void start({
      characterName: char,
      serverSlug: server,
      region,
      difficulty,
      encounters: zone.encounters,
    });
  }, [char, server, region, difficulty, zoneId, zones, zonesLoading, start]);

  useEffect(() => {
    if (!reportCode || !reportActorId) return;
    if (reportMetaLoading) return;
    const key = `${reportCode}|${reportActorId}|${reportDifficulty}`;
    if (lastReportKeyRef.current === key) return;
    if (!reportMeta || fetchedCode !== reportCode) {
      void fetchMeta(reportCode);
      return;
    }
    const actor = reportMeta.actors.find((a) => a.id === reportActorId);
    if (!actor) return;
    lastReportKeyRef.current = key;
    void startReport({
      code: reportCode,
      actor,
      difficulty: reportDifficulty,
      fights: reportMeta.fights,
    });
  }, [
    reportCode,
    reportActorId,
    reportDifficulty,
    reportMeta,
    fetchedCode,
    reportMetaLoading,
    fetchMeta,
    startReport,
  ]);

  return {
    char,
    server,
    region,
    difficulty,
    zoneId,
    reportCode,
    reportActorId,
    reportDifficulty,
    bossParam,
    clearCharKey: () => {
      lastKeyRef.current = null;
    },
    clearReportKey: () => {
      lastReportKeyRef.current = null;
    },
    setReportKey: (key: string) => {
      lastReportKeyRef.current = key;
    },
  };
}
