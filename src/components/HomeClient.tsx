'use client';

import type { AnalysisInput, ReportActor, ReportFight } from '@/types';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CharacterForm } from '@/components/forms/CharacterForm';
import { ReportForm } from '@/components/forms/ReportForm';
import { CharacterSwitcher } from '@/components/report/CharacterSwitcher';
import { ResultsDashboard } from '@/components/results/ResultsDashboard';
import { ModeSelector } from '@/components/ui/ModeSelector';
import { useAnalysis } from '@/hooks/useAnalysis';
import { useReportAnalysis } from '@/hooks/useReportAnalysis';
import { useReportMeta } from '@/hooks/useReportMeta';
import { useZones } from '@/hooks/useZones';

function parseDifficulty(val: string | null): AnalysisInput['difficulty'] {
  const n = Number(val);
  return n === 3 || n === 4 || n === 5 ? n : 4;
}

// Actors + fights cached from the last submit/switch (event-handler only, never set in an effect)
interface ReportContext {
  code: string;
  difficulty: number;
  fights: ReportFight[];
  actors: ReportActor[];
  selectedActorId: number;
}

export function HomeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { zones, loading: zonesLoading, error: zonesError } = useZones();
  const { bossStates, currentDifficulty, isAnyLoading, input, start, reset } = useAnalysis();
  const {
    result: reportResult,
    loading: reportLoading,
    start: startReport,
    reset: resetReport,
  } = useReportAnalysis();
  const { meta: reportMeta, fetchedCode, loading: reportMetaLoading, fetchMeta } = useReportMeta();

  const [mode, setMode] = useState<'character' | 'report' | null>(null);
  // Set only from event handlers (handleReportSubmit / handleSwitchActor), never from an effect
  const [reportContext, setReportContext] = useState<ReportContext | null>(null);

  // Character mode URL params
  const char = searchParams.get('char');
  const server = searchParams.get('server');
  const region = (searchParams.get('region') ?? 'EU') as AnalysisInput['region'];
  const difficulty = parseDifficulty(searchParams.get('difficulty'));
  const zoneId = Number(searchParams.get('zone')) || null;

  // Report mode URL params
  const reportCode = searchParams.get('report');
  const reportActorId = Number(searchParams.get('actor')) || null;
  const reportDifficulty = parseDifficulty(searchParams.get('difficulty'));

  // Shared boss param
  const bossParam = Number(searchParams.get('boss')) || null;

  const lastKeyRef = useRef<string | null>(null);
  const lastReportKeyRef = useRef<string | null>(null);

  // Character mode: restore from URL
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

  // Report mode: restore from URL — only calls startReport, never setState
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

  // Derive active boss index from URL for both modes
  const charActiveBossIdx =
    bossParam && input
      ? Math.max(
          0,
          input.encounters.findIndex((e) => e.id === bossParam)
        )
      : 0;
  const reportActiveBossIdx =
    bossParam && reportResult
      ? Math.max(
          0,
          reportResult.input.encounters.findIndex((e) => e.id === bossParam)
        )
      : 0;

  // Actors for CharacterSwitcher: prefer event-set context, fall back to fetched meta (URL restore path)
  const switcherActors =
    reportContext?.actors ?? (fetchedCode === reportCode ? (reportMeta?.actors ?? []) : []);
  const switcherSelectedId = reportContext?.selectedActorId ?? reportActorId ?? 0;

  function handleSubmit(analysisInput: AnalysisInput, selectedZoneId: number) {
    const params = new URLSearchParams({
      char: analysisInput.characterName,
      server: analysisInput.serverSlug,
      region: analysisInput.region,
      difficulty: String(analysisInput.difficulty),
      zone: String(selectedZoneId),
    });
    router.push(`/?${params.toString()}`);
  }

  function handleDifficultyChange(newDifficulty: AnalysisInput['difficulty']) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('difficulty', String(newDifficulty));
    router.push(`/?${params.toString()}`);
  }

  function handleReset() {
    reset();
    lastKeyRef.current = null;
    router.push('/');
    setMode(null);
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
    diff: number,
    fights: ReportFight[],
    actors: ReportActor[]
  ) {
    // Set key before URL push so the URL-restore effect skips the double-fire
    const key = `${code}|${actor.id}|${diff}`;
    lastReportKeyRef.current = key;
    setReportContext({ code, difficulty: diff, fights, actors, selectedActorId: actor.id });
    const params = new URLSearchParams({
      report: code,
      actor: String(actor.id),
      difficulty: String(diff),
    });
    router.push(`/?${params.toString()}`);
    void startReport({ code, actor, difficulty: diff, fights });
  }

  function handleSwitchActor(actor: ReportActor) {
    if (!reportContext || reportLoading) return;
    const key = `${reportContext.code}|${actor.id}|${reportContext.difficulty}`;
    lastReportKeyRef.current = key;
    setReportContext((prev) => prev && { ...prev, selectedActorId: actor.id });
    const params = new URLSearchParams(searchParams.toString());
    params.set('actor', String(actor.id));
    params.delete('boss');
    router.push(`/?${params.toString()}`);
    void startReport({
      code: reportContext.code,
      actor,
      difficulty: reportContext.difficulty,
      fights: reportContext.fights,
    });
  }

  function handleReportBossChange(idx: number) {
    if (!reportResult) return;
    const enc = reportResult.input.encounters[idx];
    if (!enc) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('boss', String(enc.id));
    router.replace(`/?${params.toString()}`);
  }

  function handleReportReset() {
    resetReport();
    setReportContext(null);
    lastReportKeyRef.current = null;
    router.push('/');
    setMode(null);
  }

  // Report mode results
  if (reportResult && (reportContext ?? (reportCode && reportActorId))) {
    const reportBossStates = reportResult.bosses.map((b) => ({
      status: 'success' as const,
      result: b ?? null,
    }));
    return (
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <CharacterSwitcher
          actors={switcherActors}
          selectedActorId={switcherSelectedId}
          loading={reportLoading}
          onSelect={handleSwitchActor}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <ResultsDashboard
            input={reportResult.input}
            bossStates={reportBossStates}
            currentDifficulty={reportResult.input.difficulty}
            activeBossIdx={reportActiveBossIdx}
            onDifficultyChange={() => {}}
            onBossChange={handleReportBossChange}
            onReset={handleReportReset}
          />
        </div>
      </div>
    );
  }

  // Character mode results
  if (input) {
    return (
      <ResultsDashboard
        input={input}
        bossStates={bossStates}
        currentDifficulty={currentDifficulty ?? difficulty}
        activeBossIdx={charActiveBossIdx}
        onDifficultyChange={handleDifficultyChange}
        onBossChange={handleCharBossChange}
        onReset={handleReset}
      />
    );
  }

  // URL has params but data still loading
  if ((char && server) || (reportCode && reportActorId)) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.85rem',
          color: 'var(--text-dim)',
        }}
      >
        Loading…
      </div>
    );
  }

  if (mode === null) {
    return <ModeSelector onSelect={setMode} />;
  }

  if (mode === 'report') {
    return (
      <ReportForm
        onSubmit={handleReportSubmit}
        loading={reportLoading}
        onBack={() => setMode(null)}
      />
    );
  }

  // mode === 'character'
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
