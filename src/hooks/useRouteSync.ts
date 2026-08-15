'use client';

import type { useAnalysis } from './useAnalysis';
import type { useReportAnalysis } from './useReportAnalysis';
import type { useReportMeta } from './useReportMeta';
import type { AnalysisInput, ReportMeta, Zone } from '@/types';
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
  specParam: number | null;
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
  // Les deux écritures d'URL posent toujours `spec`. Une URL qui en manque est tronquée, et
  // lui donner une spec par défaut lancerait une analyse entière sur une spec que personne
  // n'a choisie — un rapport faux qui ne se signale pas. On refuse de démarrer à la place.
  const specParam = Number(searchParams.get('spec')) || null;
  const bossParam = Number(searchParams.get('boss')) || null;
  /**
   * La marque posée par le bouton de partage. Elle autorise le serveur à servir l'instantané
   * du rendu partagé plutôt que de rejouer le pipeline.
   *
   * Hors des deux clés de dédoublonnage, volontairement : une clé qui la porterait relancerait
   * l'analyse entière au moment où la marque disparaît de l'URL, ce qu'on cherche justement à
   * éviter. Elle n'est honorée qu'à la première analyse de la session — les écritures d'URL
   * qui suivent repartent de `searchParams.toString()` et la traînent, or un changement de
   * difficulté ou de personnage est une demande neuve, pas l'ouverture d'un lien.
   */
  const shared = searchParams.get('shared') === '1';

  const lastKeyRef = useRef<string | null>(null);
  const lastReportKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!char || !server || !specParam || zonesLoading || zones.length === 0) return;
    const zone = (zoneId ? zones.find((z) => z.id === zoneId) : null) ?? zones[0];
    if (!zone) return;
    const key = `${char}|${server}|${region}|${difficulty}|${zone.id}|${specParam}`;
    if (lastKeyRef.current === key) return;
    const preferSnapshot = shared && lastKeyRef.current === null;
    lastKeyRef.current = key;
    void start(
      {
        characterName: char,
        serverSlug: server,
        region,
        difficulty,
        encounters: zone.encounters,
        specId: specParam,
      },
      { preferSnapshot }
    );
  }, [char, server, region, difficulty, zoneId, zones, zonesLoading, specParam, shared, start]);

  useEffect(() => {
    if (!reportCode || !reportActorId || !specParam) return;
    if (reportMetaLoading) return;
    const key = `${reportCode}|${reportActorId}|${reportDifficulty}|${specParam}`;
    if (lastReportKeyRef.current === key) return;
    if (!reportMeta || fetchedCode !== reportCode) {
      void fetchMeta(reportCode);
      return;
    }
    const actor = reportMeta.actors.find((a) => a.id === reportActorId);
    if (!actor) return;
    const preferSnapshot = shared && lastReportKeyRef.current === null;
    lastReportKeyRef.current = key;
    void startReport({
      code: reportCode,
      actor,
      specId: specParam,
      difficulty: reportDifficulty,
      fights: reportMeta.fights,
      preferSnapshot,
    });
  }, [
    reportCode,
    reportActorId,
    reportDifficulty,
    reportMeta,
    fetchedCode,
    reportMetaLoading,
    specParam,
    shared,
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
    specParam,
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
