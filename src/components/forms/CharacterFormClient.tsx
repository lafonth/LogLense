'use client';

import type { AnalysisInput } from '@/types';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LoggedInCharacterForm } from '@/components/forms/LoggedInCharacterForm';
import { useZones } from '@/hooks/useZones';
import { characterResultPath, HOME_PATH } from '@/lib/routes';

/**
 * Le formulaire d'analyse par personnage. Il ne lance plus rien : il compose l'URL du
 * résultat et y navigue. C'est la route d'arrivée qui démarre l'analyse, donc un lien collé
 * et un formulaire soumis passent par le même chemin — il n'y a plus de « démarrage » qui
 * n'existe que pour l'un des deux.
 */
export function CharacterFormClient() {
  const router = useRouter();
  const { zones, loading: zonesLoading, error: zonesError, retry } = useZones(true);
  // La navigation n'est pas instantanée et la requête part de l'écran suivant : sans ça, le
  // formulaire reste actif et invite à un second clic qui lancerait une seconde analyse.
  const [navigating, setNavigating] = useState(false);

  function handleSubmit(input: AnalysisInput, zoneId: number) {
    setNavigating(true);
    router.push(
      characterResultPath(
        { region: input.region, realm: input.serverSlug, name: input.characterName },
        { difficulty: input.difficulty, zone: zoneId, spec: input.specId }
      )
    );
  }

  return (
    <LoggedInCharacterForm
      onSubmit={handleSubmit}
      loading={navigating}
      zones={zones}
      zonesLoading={zonesLoading}
      zonesError={zonesError}
      onZonesRetry={retry}
      onBack={() => router.push(HOME_PATH)}
    />
  );
}
