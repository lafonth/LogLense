'use client';

import type { ReportRoute, TabId } from '@/lib/routes';
import type { ReportActor } from '@/types';
import { useRouter, useSearchParams } from 'next/navigation';
import { ReportDashboard } from '@/components/report/ReportDashboard';
import { ResultErrorScreen } from '@/components/shared/ResultErrorScreen';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { useReportAnalysis } from '@/hooks/useReportAnalysis';
import { useReportMeta } from '@/hooks/useReportMeta';
import { useReportRouteSync } from '@/hooks/useReportRouteSync';
import { groupKillsByEncounter } from '@/lib/report-kills';
import { parseTab, REPORT_FORM_PATH, reportResultPath, withPatchedQuery } from '@/lib/routes';

/**
 * L'analyse d'un acteur d'un rapport, à son URL.
 *
 * Symétrique de `CharacterResultClient`, à une dépendance près : la méta du rapport. Elle
 * était portée en mémoire par l'écran de formulaire ; maintenant que les deux écrans sont
 * deux routes, elle est récupérée ici — servie par `report-meta-cache` quand le lecteur
 * vient du formulaire, redemandée une fois quand il vient d'un lien collé.
 */
export function ReportResultClient({ route }: { route: ReportRoute }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { meta, fetchedCode, loading: metaLoading, error: metaError, fetchMeta } = useReportMeta();
  const {
    result,
    loading,
    pullSelection,
    pullStatus,
    start: startReport,
    switchPull,
  } = useReportAnalysis();

  const { difficulty, bossParam, specParam, retryMeta } = useReportRouteSync({
    route,
    meta,
    fetchedCode,
    metaLoading,
    metaError,
    fetchMeta,
    startReport,
  });

  // La méta n'est celle de ce rapport que si elle a été récupérée pour lui : pendant une
  // navigation d'un rapport à l'autre, `meta` porte encore le précédent.
  const shellMeta = fetchedCode === route.code ? meta : null;
  const actorName = shellMeta?.actors.find((a) => a.id === route.actorId)?.name ?? '';
  const activeBossIdx =
    bossParam && shellMeta
      ? Math.max(
          0,
          groupKillsByEncounter(shellMeta.fights, difficulty).findIndex((g) => g.id === bossParam)
        )
      : 0;

  const activeTab = parseTab(searchParams.get('tab'));

  function handleSwitchActor(actor: ReportActor) {
    if (loading) return;
    // Rien d'autre que l'URL : c'est `useReportRouteSync` qui relance l'analyse. Le boss
    // tombe, il n'a pas de sens hors de l'acteur qui l'a combattu.
    const path = reportResultPath({ code: route.code, actorId: actor.id });
    router.push(withPatchedQuery(path, searchParams, { boss: null }));
  }

  function handleDifficultyChange(diff: number) {
    // Contrairement au chemin par personnage, `boss` tombe : la liste des boss d'un rapport
    // est celle des kills à ce palier-là, donc elle change avec lui.
    router.push(
      withPatchedQuery(reportResultPath(route), searchParams, { difficulty: diff, boss: null })
    );
  }

  function handleBossChange(idx: number) {
    if (!shellMeta) return;
    const encId = groupKillsByEncounter(shellMeta.fights, difficulty)[idx]?.id;
    if (!encId) return;
    router.replace(withPatchedQuery(reportResultPath(route), searchParams, { boss: encId }));
  }

  function handleTabChange(tab: TabId) {
    // `replace` comme le rail de boss : passer d'un onglet à l'autre n'est pas une navigation,
    // c'est un regard. Le lien reste collable, l'historique reste utilisable.
    router.replace(withPatchedQuery(reportResultPath(route), searchParams, { tab }));
  }

  function handleReset() {
    router.push(REPORT_FORM_PATH);
  }

  if (shellMeta && actorName && (result || loading)) {
    return (
      <ReportDashboard
        meta={shellMeta}
        actors={shellMeta.actors}
        selectedActorId={route.actorId}
        actorName={actorName}
        difficulty={difficulty}
        activeBossIdx={activeBossIdx}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        result={result}
        loading={loading}
        pullSelection={pullSelection}
        pullStatus={pullStatus}
        onSwitchActor={handleSwitchActor}
        onDifficultyChange={handleDifficultyChange}
        onBossChange={handleBossChange}
        onSelectPull={(encounterId, fightId) => void switchPull(encounterId, fightId)}
        onReset={handleReset}
      />
    );
  }

  if (!specParam) {
    // Voir `CharacterResultClient` : sans `spec`, le hook ne lance rien.
    return (
      <ResultErrorScreen
        message="This link is missing the spec it was analysed for."
        onBack={handleReset}
        backLabel="New report"
      />
    );
  }

  if (metaError) {
    return (
      <ResultErrorScreen
        message={metaError}
        onRetry={retryMeta}
        onBack={handleReset}
        backLabel="New report"
      />
    );
  }

  if (shellMeta && !actorName) {
    return (
      <ResultErrorScreen
        message="This report has no player with that id."
        onBack={handleReset}
        backLabel="New report"
      />
    );
  }

  return <LoadingScreen />;
}
