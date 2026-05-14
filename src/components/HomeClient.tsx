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
import { useZones } from '@/hooks/useZones';

function parseDifficulty(val: string | null): AnalysisInput['difficulty'] {
  const n = Number(val);
  return n === 3 || n === 4 || n === 5 ? n : 4;
}

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

  const [mode, setMode] = useState<'character' | 'report' | null>(null);
  const [reportContext, setReportContext] = useState<ReportContext | null>(null);

  const char = searchParams.get('char');
  const server = searchParams.get('server');
  const region = (searchParams.get('region') ?? 'EU') as AnalysisInput['region'];
  const difficulty = parseDifficulty(searchParams.get('difficulty'));
  const zoneId = Number(searchParams.get('zone')) || null;

  const lastKeyRef = useRef<string | null>(null);

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

  function handleReportSubmit(
    code: string,
    actor: ReportActor,
    diff: number,
    fights: ReportFight[],
    actors: ReportActor[]
  ) {
    setReportContext({ code, difficulty: diff, fights, actors, selectedActorId: actor.id });
    void startReport({ code, actor, difficulty: diff, fights });
  }

  function handleSwitchActor(actor: ReportActor) {
    if (!reportContext || reportLoading) return;
    setReportContext((prev) => prev && { ...prev, selectedActorId: actor.id });
    void startReport({
      code: reportContext.code,
      actor,
      difficulty: reportContext.difficulty,
      fights: reportContext.fights,
    });
  }

  // Report mode results
  if (reportResult && reportContext) {
    const reportBossStates = reportResult.bosses.map((b) => ({
      status: 'success' as const,
      result: b ?? null,
    }));
    return (
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <CharacterSwitcher
          actors={reportContext.actors}
          selectedActorId={reportContext.selectedActorId}
          loading={reportLoading}
          onSelect={handleSwitchActor}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <ResultsDashboard
            input={reportResult.input}
            bossStates={reportBossStates}
            currentDifficulty={reportResult.input.difficulty}
            onDifficultyChange={() => {}}
            onReset={() => {
              resetReport();
              setReportContext(null);
              setMode(null);
            }}
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
        onDifficultyChange={handleDifficultyChange}
        onReset={handleReset}
      />
    );
  }

  // URL has params but zones still loading — brief transition state
  if (char && server) {
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
