'use client';

import type { useReportAnalysis } from './useReportAnalysis';
import type { useReportMeta } from './useReportMeta';
import type { ReportRoute } from '@/lib/routes';
import type { ReportMeta } from '@/types';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { parseDifficulty } from '@/lib/routes';

interface UseReportRouteSyncParams {
  route: ReportRoute;
  meta: ReportMeta | null;
  fetchedCode: string | null;
  metaLoading: boolean;
  metaError: string | null;
  fetchMeta: ReturnType<typeof useReportMeta>['fetchMeta'];
  startReport: ReturnType<typeof useReportAnalysis>['start'];
}

export interface ReportRouteState {
  difficulty: 3 | 4 | 5;
  specParam: number | null;
  bossParam: number | null;
  /** Rejoue la récupération de la méta après un échec — voir le garde-fou plus bas. */
  retryMeta: () => void;
}

/**
 * Symétrique de `useCharacterRouteSync` : le rapport et l'acteur viennent des segments, le
 * palier et la spec de la query. La méta du rapport est récupérée d'abord — sans elle, ni
 * l'acteur ni les pulls ne sont connus.
 */
export function useReportRouteSync({
  route,
  meta,
  fetchedCode,
  metaLoading,
  metaError,
  fetchMeta,
  startReport,
}: UseReportRouteSyncParams): ReportRouteState {
  const searchParams = useSearchParams();

  const { code, actorId } = route;
  const difficulty = parseDifficulty(searchParams.get('difficulty'));
  // Voir `useCharacterRouteSync` : sans `spec`, on refuse de démarrer plutôt que d'analyser
  // une spec que personne n'a choisie.
  const specParam = Number(searchParams.get('spec')) || null;
  const bossParam = Number(searchParams.get('boss')) || null;
  /** Hors de la clé de dédoublonnage, et honorée à la première analyse seulement. */
  const shared = searchParams.get('shared') === '1';

  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!specParam) return;
    if (metaLoading) return;
    const key = `${code}|${actorId}|${difficulty}|${specParam}`;
    if (lastKeyRef.current === key) return;
    if (!meta || fetchedCode !== code) {
      // Un échec arrête la boucle net. Sans ce garde-fou, l'échec repasse `metaLoading` à
      // faux, ce qui réveille l'effet, qui redemande la méta : une rafale de requêtes WCL
      // sur un rapport qui vient précisément de refuser d'en donner. La reprise est un
      // geste du lecteur (`retryMeta`), pas un réflexe de l'effet.
      if (!metaError) void fetchMeta(code);
      return;
    }
    const actor = meta.actors.find((a) => a.id === actorId);
    if (!actor) return;
    const preferSnapshot = shared && lastKeyRef.current === null;
    lastKeyRef.current = key;
    void startReport({
      code,
      actor,
      specId: specParam,
      difficulty,
      fights: meta.fights,
      preferSnapshot,
    });
  }, [
    code,
    actorId,
    difficulty,
    meta,
    fetchedCode,
    metaLoading,
    metaError,
    specParam,
    shared,
    fetchMeta,
    startReport,
  ]);

  return {
    difficulty,
    specParam,
    bossParam,
    retryMeta: () => {
      void fetchMeta(code);
    },
  };
}
