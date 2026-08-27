'use client';

import type { useAnalysis } from './useAnalysis';
import type { CharacterRoute } from '@/lib/routes';
import type { Zone } from '@/types';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { parseDifficulty } from '@/lib/routes';

interface UseCharacterRouteSyncParams {
  route: CharacterRoute;
  zones: Zone[];
  zonesLoading: boolean;
  start: ReturnType<typeof useAnalysis>['start'];
}

export interface CharacterRouteState {
  difficulty: 3 | 4 | 5;
  zoneId: number | null;
  specParam: number | null;
  bossParam: number | null;
}

/**
 * L'URL décide de l'analyse en cours. Le personnage vient des segments de chemin, le reste
 * de la query — voir la frontière posée dans `src/lib/routes.ts`.
 */
export function useCharacterRouteSync({
  route,
  zones,
  zonesLoading,
  start,
}: UseCharacterRouteSyncParams): CharacterRouteState {
  const searchParams = useSearchParams();

  const { name, realm, region } = route;
  const difficulty = parseDifficulty(searchParams.get('difficulty'));
  const zoneId = Number(searchParams.get('zone')) || null;
  // Les écritures d'URL posent toujours `spec`. Une URL qui en manque est tronquée, et lui
  // donner une spec par défaut lancerait une analyse entière sur une spec que personne n'a
  // choisie — un rapport faux qui ne se signale pas. On refuse de démarrer à la place.
  const specParam = Number(searchParams.get('spec')) || null;
  const bossParam = Number(searchParams.get('boss')) || null;
  /**
   * La marque posée par le bouton de partage. Elle autorise le serveur à servir l'instantané
   * du rendu partagé plutôt que de rejouer le pipeline.
   *
   * Hors de la clé de dédoublonnage, volontairement : une clé qui la porterait relancerait
   * l'analyse entière au moment où la marque disparaît de l'URL, ce qu'on cherche justement à
   * éviter. Elle n'est honorée qu'à la première analyse de la session — les écritures d'URL
   * qui suivent repartent de la query courante et la traînent, or un changement de difficulté
   * ou de personnage est une demande neuve, pas l'ouverture d'un lien.
   */
  const shared = searchParams.get('shared') === '1';

  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!specParam || zonesLoading || zones.length === 0) return;
    const zone = (zoneId ? zones.find((z) => z.id === zoneId) : null) ?? zones[0];
    if (!zone) return;
    const key = `${name}|${realm}|${region}|${difficulty}|${zone.id}|${specParam}`;
    if (lastKeyRef.current === key) return;
    const preferSnapshot = shared && lastKeyRef.current === null;
    lastKeyRef.current = key;
    void start(
      {
        characterName: name,
        serverSlug: realm,
        region,
        difficulty,
        encounters: zone.encounters,
        specId: specParam,
      },
      { preferSnapshot }
    );
  }, [name, realm, region, difficulty, zoneId, zones, zonesLoading, specParam, shared, start]);

  return { difficulty, zoneId, specParam, bossParam };
}
