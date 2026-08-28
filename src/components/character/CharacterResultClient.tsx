'use client';

import type { CharacterRoute, TabId } from '@/lib/routes';
import type { AnalysisInput } from '@/types';
import { useRouter, useSearchParams } from 'next/navigation';
import { CharacterDashboard } from '@/components/character/CharacterDashboard';
import { ResultErrorScreen } from '@/components/shared/ResultErrorScreen';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { useAnalysis } from '@/hooks/useAnalysis';
import { useCharacterRouteSync } from '@/hooks/useCharacterRouteSync';
import { useZones } from '@/hooks/useZones';
import { characterResultPath, HOME_PATH, parseTab, withPatchedQuery } from '@/lib/routes';

/**
 * L'analyse d'un personnage, à son URL.
 *
 * Le composant ne décide de rien : il lit la route, la donne à `useCharacterRouteSync`, et
 * réécrit l'URL quand le lecteur change de palier, de boss ou de personnage. C'est l'URL qui
 * relance l'analyse, jamais un gestionnaire — un lien collé et un clic sur « Mythique »
 * suivent donc exactement le même chemin.
 */
export function CharacterResultClient({ route }: { route: CharacterRoute }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // La session est acquise : `AppShell` est la porte, cette route est derrière.
  const { zones, loading: zonesLoading, error: zonesError, retry: retryZones } = useZones(true);
  const {
    bossStates,
    currentDifficulty,
    input,
    start,
    switchBossSpec,
    switchBossFight,
    retryBoss,
  } = useAnalysis();

  const { difficulty, specParam, bossParam } = useCharacterRouteSync({
    route,
    zones,
    zonesLoading,
    start,
  });

  const activeBossIdx =
    bossParam && input
      ? Math.max(
          0,
          input.encounters.findIndex((e) => e.id === bossParam)
        )
      : 0;

  const activeTab = parseTab(searchParams.get('tab'));

  function pushQuery(patch: Record<string, string | number | null>) {
    router.push(withPatchedQuery(characterResultPath(route), searchParams, patch));
  }

  function handleDifficultyChange(newDifficulty: AnalysisInput['difficulty']) {
    // `boss` survit ici, contrairement au chemin par rapport : la liste des boss est celle de
    // la zone, la même à tous les paliers.
    pushQuery({ difficulty: newDifficulty });
  }

  function handleSwitchCharacter(name: string, realmSlug: string) {
    // Le royaume change avec le personnage, la région non : le sélecteur ne propose que les
    // personnages du compte connecté, tous sur la région déjà à l'écran.
    const path = characterResultPath({ region: route.region, realm: realmSlug, name });
    router.push(withPatchedQuery(path, searchParams, { boss: null }));
  }

  function handleBossChange(idx: number) {
    if (!input) return;
    const enc = input.encounters[idx];
    if (!enc) return;
    // `replace` : parcourir le rail de boss ne mérite pas huit entrées d'historique.
    router.replace(withPatchedQuery(characterResultPath(route), searchParams, { boss: enc.id }));
  }

  function handleTabChange(tab: TabId) {
    // `replace` comme le rail de boss : passer d'un onglet à l'autre n'est pas une navigation,
    // c'est un regard. Le lien reste collable, l'historique reste utilisable.
    router.replace(withPatchedQuery(characterResultPath(route), searchParams, { tab }));
  }

  function handleReset() {
    // Le formulaire, pas le sélecteur de mode : qui recommence veut relancer une analyse.
    router.push(HOME_PATH);
  }

  if (input) {
    return (
      <CharacterDashboard
        input={input}
        bossStates={bossStates}
        currentDifficulty={currentDifficulty ?? difficulty}
        activeBossIdx={activeBossIdx}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onDifficultyChange={handleDifficultyChange}
        onBossChange={handleBossChange}
        onReset={handleReset}
        onSwitchCharacter={handleSwitchCharacter}
        onSwitchBossSpec={switchBossSpec}
        onSwitchBossFight={switchBossFight}
        onRetryBoss={retryBoss}
      />
    );
  }

  if (!specParam) {
    // Sans `spec`, le hook ne lance rien : un spinner tournerait sans fin. On le dit.
    return (
      <ResultErrorScreen
        message="This link is missing the spec it was analysed for."
        onBack={handleReset}
        backLabel="New analysis"
      />
    );
  }

  if (zonesError) {
    return (
      <ResultErrorScreen
        message={zonesError}
        onRetry={retryZones}
        onBack={handleReset}
        backLabel="New analysis"
      />
    );
  }

  return <LoadingScreen />;
}
