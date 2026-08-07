'use client';

import type { AnalysisInput, ReportActor, ReportFight } from '@/types';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { CharacterDashboard } from '@/components/character/CharacterDashboard';
import { CharacterForm } from '@/components/forms/CharacterForm';
import { LoggedInCharacterForm } from '@/components/forms/LoggedInCharacterForm';
import { ReportForm } from '@/components/forms/ReportForm';
import { MarketingLanding } from '@/components/landing/MarketingLanding';
import { ReportDashboard } from '@/components/report/ReportDashboard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ModeSelector } from '@/components/ui/ModeSelector';
import { useAnalysis } from '@/hooks/useAnalysis';
import { useReportAnalysis } from '@/hooks/useReportAnalysis';
import { useReportMeta } from '@/hooks/useReportMeta';
import { useRouteSync } from '@/hooks/useRouteSync';
import { useZones } from '@/hooks/useZones';

interface ReportContext {
  code: string;
  title: string;
  difficulty: number;
  fights: ReportFight[];
  actors: ReportActor[];
  selectedActorId: number;
}

export function HomeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status: sessionStatus } = useSession();
  const { zones, loading: zonesLoading, error: zonesError } = useZones();
  const { bossStates, currentDifficulty, isAnyLoading, input, start, switchBossSpec, reset } =
    useAnalysis();
  const {
    result: reportResult,
    loading: reportLoading,
    start: startReport,
    reset: resetReport,
  } = useReportAnalysis();
  const { meta: reportMeta, fetchedCode, loading: reportMetaLoading, fetchMeta } = useReportMeta();

  const [mode, setMode] = useState<'character' | 'report' | null>(null);
  const [reportContext, setReportContext] = useState<ReportContext | null>(null);

  const {
    char,
    server,
    difficulty,
    reportCode,
    reportActorId,
    reportDifficulty,
    specParam,
    bossParam,
    clearCharKey,
    clearReportKey,
    setReportKey,
  } = useRouteSync({
    zones,
    zonesLoading,
    reportMeta,
    fetchedCode,
    reportMetaLoading,
    start,
    startReport,
    fetchMeta,
  });

  // Derived: character mode active boss
  const charActiveBossIdx =
    bossParam && input
      ? Math.max(
          0,
          input.encounters.findIndex((e) => e.id === bossParam)
        )
      : 0;

  // Derived: report mode shell (context from fresh submit, or meta from URL restore)
  const reportShellMeta = reportContext
    ? { title: reportContext.title, fights: reportContext.fights, actors: reportContext.actors }
    : fetchedCode === reportCode && reportMeta
      ? reportMeta
      : null;
  const reportShellActorId = reportContext?.selectedActorId ?? reportActorId ?? 0;
  const reportShellActorName =
    reportShellMeta?.actors.find((a) => a.id === reportShellActorId)?.name ?? '';
  const reportActiveBossIdx =
    bossParam && reportShellMeta
      ? Math.max(
          0,
          reportShellMeta.fights
            .filter((f) => f.kill && f.difficulty === reportDifficulty && f.encounterID > 0)
            .reduce<number[]>(
              (acc, f) => (acc.includes(f.encounterID) ? acc : [...acc, f.encounterID]),
              []
            )
            .indexOf(bossParam)
        )
      : 0;

  function handleSubmit(analysisInput: AnalysisInput, selectedZoneId: number) {
    router.push(
      `/?${new URLSearchParams({
        char: analysisInput.characterName,
        server: analysisInput.serverSlug,
        region: analysisInput.region,
        difficulty: String(analysisInput.difficulty),
        zone: String(selectedZoneId),
        spec: String(analysisInput.specId),
      }).toString()}`
    );
  }

  function handleDifficultyChange(newDifficulty: AnalysisInput['difficulty']) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('difficulty', String(newDifficulty));
    router.push(`/?${params.toString()}`);
  }

  function handleReset() {
    reset();
    clearCharKey();
    router.push('/');
    setMode(null);
  }

  function handleSwitchCharacter(name: string, realmSlug: string) {
    if (!input) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('char', name);
    params.set('server', realmSlug);
    params.delete('boss');
    router.push(`/?${params.toString()}`);
  }

  function handleCharBossChange(idx: number) {
    if (!input) return;
    const enc = input.encounters[idx];
    if (!enc) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('boss', String(enc.id));
    router.replace(`/?${params.toString()}`);
  }

  function handleReportSubmit(
    code: string,
    actor: ReportActor,
    specId: number,
    diff: number,
    fights: ReportFight[],
    actors: ReportActor[],
    title: string
  ) {
    setReportKey(`${code}|${actor.id}|${diff}`);
    setReportContext({ code, title, difficulty: diff, fights, actors, selectedActorId: actor.id });
    router.push(
      `/?${new URLSearchParams({ report: code, actor: String(actor.id), difficulty: String(diff), spec: String(specId) }).toString()}`
    );
    void startReport({ code, actor, specId, difficulty: diff, fights });
  }

  function handleSwitchActor(actor: ReportActor) {
    if (reportLoading) return;
    const code = reportContext?.code ?? reportCode;
    const diff = reportContext?.difficulty ?? reportDifficulty;
    const fights = reportContext?.fights ?? reportShellMeta?.fights;
    if (!code || !fights) return;
    // L'URL porte toujours `spec` sur ce chemin : c'est une mesure, pas une supposition.
    // Le 0 final ne sert qu'au cas dégradé, où il vaut mieux dire « inconnue » que « Feral ».
    const currentSpecId = reportResult?.input.specId ?? specParam ?? 0;
    setReportKey(`${code}|${actor.id}|${diff}`);
    setReportContext((prev) => (prev ? { ...prev, selectedActorId: actor.id } : null));
    const params = new URLSearchParams(searchParams.toString());
    params.set('actor', String(actor.id));
    params.delete('boss');
    router.push(`/?${params.toString()}`);
    void startReport({ code, actor, specId: currentSpecId, difficulty: diff, fights });
  }

  function handleReportDifficultyChange(diff: number) {
    setReportContext((prev) => (prev ? { ...prev, difficulty: diff } : null));
    const params = new URLSearchParams(searchParams.toString());
    params.set('difficulty', String(diff));
    params.delete('boss');
    router.push(`/?${params.toString()}`);
  }

  function handleReportBossChange(idx: number) {
    if (!reportShellMeta) return;
    const uniqueEncIds = reportShellMeta.fights
      .filter((f) => f.kill && f.difficulty === reportDifficulty && f.encounterID > 0)
      .reduce<
        number[]
      >((acc, f) => (acc.includes(f.encounterID) ? acc : [...acc, f.encounterID]), []);
    const encId = uniqueEncIds[idx];
    if (!encId) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('boss', String(encId));
    router.replace(`/?${params.toString()}`);
  }

  function handleReportReset() {
    resetReport();
    setReportContext(null);
    clearReportKey();
    router.push('/');
    setMode(null);
  }

  if (reportShellMeta && reportShellActorName && (reportResult || reportLoading)) {
    return (
      <ReportDashboard
        meta={reportShellMeta}
        actors={reportShellMeta.actors}
        selectedActorId={reportShellActorId}
        actorName={reportShellActorName}
        difficulty={reportDifficulty}
        activeBossIdx={reportActiveBossIdx}
        result={reportResult}
        loading={reportLoading}
        onSwitchActor={handleSwitchActor}
        onDifficultyChange={handleReportDifficultyChange}
        onBossChange={handleReportBossChange}
        onReset={handleReportReset}
      />
    );
  }

  if (input) {
    return (
      <CharacterDashboard
        input={input}
        bossStates={bossStates}
        currentDifficulty={currentDifficulty ?? difficulty}
        activeBossIdx={charActiveBossIdx}
        onDifficultyChange={handleDifficultyChange}
        onBossChange={handleCharBossChange}
        onReset={handleReset}
        onSwitchCharacter={session ? handleSwitchCharacter : undefined}
        onSwitchBossSpec={switchBossSpec}
      />
    );
  }

  // Sans `spec`, `useRouteSync` ne lance rien : afficher le spinner ici tournerait sans fin.
  // On retombe sur le formulaire, où la spec se choisit.
  if (specParam && ((char && server) || (reportCode && reportActorId))) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner label="Loading…" />
      </div>
    );
  }

  if (sessionStatus === 'unauthenticated') return <MarketingLanding />;
  if (sessionStatus === 'loading') return null;
  if (mode === null) return <ModeSelector onSelect={setMode} />;

  if (mode === 'report') {
    return (
      <ReportForm
        onSubmit={handleReportSubmit}
        loading={reportLoading}
        onBack={() => setMode(null)}
      />
    );
  }

  if (session) {
    return (
      <LoggedInCharacterForm
        onSubmit={handleSubmit}
        loading={isAnyLoading}
        zones={zones}
        zonesLoading={zonesLoading}
        zonesError={zonesError}
      />
    );
  }

  return (
    <CharacterForm
      onSubmit={handleSubmit}
      loading={isAnyLoading}
      zones={zones}
      zonesLoading={zonesLoading}
      zonesError={zonesError}
    />
  );
}
