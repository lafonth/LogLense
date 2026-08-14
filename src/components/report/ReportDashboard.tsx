'use client';

import type { BossState } from '@/hooks/useAnalysis';
import type { PullStatus } from '@/hooks/useReportAnalysis';
import type { EncounterKill } from '@/lib/report-kills';
import type { AnalysisInput, AnalysisResult, ReportActor, ReportMeta } from '@/types';
import { useMemo } from 'react';
import { BossContentPanel } from '@/components/shared/BossContentPanel';
import { DashboardHeader, LoadingProgress } from '@/components/shared/DashboardHeader';
import { groupKillsByEncounter } from '@/lib/report-kills';
import { CharacterSwitcher } from './CharacterSwitcher';

interface ReportDashboardProps {
  meta: ReportMeta;
  actors: ReportActor[];
  selectedActorId: number;
  actorName: string;
  difficulty: number;
  activeBossIdx: number;
  result: AnalysisResult | null;
  loading: boolean;
  pullSelection: Record<number, number>;
  pullStatus: Record<number, PullStatus>;
  onSwitchActor: (actor: ReportActor) => void;
  onDifficultyChange: (diff: number) => void;
  onBossChange: (idx: number) => void;
  onSelectPull: (encounterId: number, fightId: number) => void;
  onReset: () => void;
}

export function ReportDashboard({
  meta,
  actors,
  selectedActorId,
  actorName,
  difficulty,
  activeBossIdx,
  result,
  loading,
  pullSelection,
  pullStatus,
  onSwitchActor,
  onDifficultyChange,
  onBossChange,
  onSelectPull,
  onReset,
}: ReportDashboardProps) {
  const availableDifficulties = useMemo(() => {
    const set = new Set<number>();
    for (const f of meta.fights) {
      if (f.kill && f.encounterID > 0) set.add(f.difficulty);
    }
    return set;
  }, [meta.fights]);

  // Le même groupement que celui qui a construit la requête : la liste des boss et l'ordre
  // des `bosses` rendus par le serveur ne peuvent pas diverger s'ils sortent d'ici.
  const groups = useMemo(
    () => groupKillsByEncounter(meta.fights, difficulty),
    [meta.fights, difficulty]
  );

  const encounters = useMemo(() => groups.map((g) => ({ id: g.id, name: g.name })), [groups]);

  const pullsByEncounter = useMemo(() => {
    const map: Record<number, EncounterKill[]> = {};
    for (const g of groups) map[g.id] = g.kills;
    return map;
  }, [groups]);

  const resultIsStale = result !== null && result.input.characterName !== actorName;

  const bossStates: BossState[] = encounters.map((enc) => {
    if (loading || !result || resultIsStale) return { status: 'loading' };
    // Une ré-analyse de pull ne concerne qu'un boss : les autres restent lisibles pendant
    // qu'elle tourne, et son échec ne vide pas l'écran.
    const pull = pullStatus[enc.id];
    if (pull?.status === 'loading') return { status: 'loading' };
    if (pull?.status === 'error') return { status: 'error', message: pull.message };
    const bossResult = result.bosses.find((b) => b?.encounterId === enc.id) ?? null;
    return { status: 'success', result: bossResult };
  });

  const region = (result?.input.region ?? 'EU') as AnalysisInput['region'];

  const analysisInput: AnalysisInput = {
    characterName: actorName,
    serverSlug: '',
    region,
    difficulty: difficulty as AnalysisInput['difficulty'],
    encounters,
    // 0 = spec inconnue, et c'est la vérité tant que le résultat n'est pas revenu : la
    // valeur descend jusqu'au prompt IA, qui la déclare inconnue au lieu de la deviner.
    // Un défaut concret ici nommerait une spec que personne n'a mesurée.
    specId: result?.input.specId ?? 0,
  };
  const analysisResult: AnalysisResult = {
    input: analysisInput,
    bosses: result?.bosses ?? [],
    generatedAt: result?.generatedAt ?? '',
  };

  return (
    <div className="flex h-full flex-col md:flex-row">
      <CharacterSwitcher
        actors={actors}
        selectedActorId={selectedActorId}
        loading={loading}
        onSelect={onSwitchActor}
      />

      <div className="min-w-0 flex-1 p-4 md:h-full md:min-h-0 md:overflow-y-auto md:px-8 md:py-6">
        <DashboardHeader
          title={actorName}
          subtitle={meta.title}
          difficulty={difficulty}
          availableDifficulties={availableDifficulties}
          onDifficultyChange={onDifficultyChange}
          onReset={onReset}
        />
        <LoadingProgress encounters={encounters} bossStates={bossStates} />
        <BossContentPanel
          encounters={encounters}
          bossStates={bossStates}
          activeBossIdx={activeBossIdx}
          onBossChange={onBossChange}
          analysisResult={analysisResult}
          pulls={pullsByEncounter}
          selectedPull={pullSelection}
          onSelectPull={onSelectPull}
        />
      </div>
    </div>
  );
}
