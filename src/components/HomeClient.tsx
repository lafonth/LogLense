'use client';

import type { AnalysisInput } from '@/types';
import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CharacterForm } from '@/components/forms/CharacterForm';
import { ResultsDashboard } from '@/components/results/ResultsDashboard';
import { useAnalysis } from '@/hooks/useAnalysis';
import { useZones } from '@/hooks/useZones';

function parseDifficulty(val: string | null): AnalysisInput['difficulty'] {
  const n = Number(val);
  return n === 3 || n === 4 || n === 5 ? n : 4;
}

export function HomeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { zones, loading: zonesLoading, error: zonesError } = useZones();
  const { bossStates, currentDifficulty, isAnyLoading, input, start, reset } = useAnalysis();

  const char = searchParams.get('char');
  const server = searchParams.get('server');
  const region = (searchParams.get('region') ?? 'EU') as AnalysisInput['region'];
  const difficulty = parseDifficulty(searchParams.get('difficulty'));
  const zoneId = Number(searchParams.get('zone')) || null;

  // Auto-start when URL has params and zones are ready
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
    // useEffect handles start() when URL updates
  }

  function handleDifficultyChange(newDifficulty: AnalysisInput['difficulty']) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('difficulty', String(newDifficulty));
    router.push(`/?${params.toString()}`);
    // useEffect handles changeDifficulty via start() with cache check
  }

  function handleReset() {
    reset();
    lastKeyRef.current = null;
    router.push('/');
  }

  // Show results when analysis is active (input set) or URL has char param (auto-starting)
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
