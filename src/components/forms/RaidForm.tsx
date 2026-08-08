'use client';

import type { RankedRaider } from '@/lib/wcl/raid-ranking';
import type { ReportActor, ReportFight } from '@/types';
import { useState } from 'react';
import { RaidRankingList } from '@/components/raid/RaidRankingList';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Select } from '@/components/ui/Select';
import { useRaidRanking } from '@/hooks/useRaidRanking';
import { useReportMeta } from '@/hooks/useReportMeta';
import { getDpsSpecsForClass } from '@/lib/specs';

const DIFFICULTY_NAMES: Record<number, string> = { 5: 'Mythic', 4: 'Heroic', 3: 'Normal' };

function fightLabel(fight: ReportFight): string {
  const difficulty = DIFFICULTY_NAMES[fight.difficulty] ?? `Difficulté ${fight.difficulty}`;
  const seconds = Math.round((fight.endTime - fight.startTime) / 1000);
  const duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return `${fight.name} — ${difficulty} — ${fight.kill ? 'Kill' : 'Wipe'} — ${duration}`;
}

interface RaidFormProps {
  onOpenPlayer: (
    code: string,
    actor: ReportActor,
    specId: number,
    difficulty: number,
    fights: ReportFight[],
    actors: ReportActor[],
    title: string
  ) => void;
  onBack: () => void;
}

/**
 * Le mode raid : un code de rapport, une pull, puis le raid trié par marge.
 *
 * L'entrée est le code seul (spec « mode raid » §5) — la pull se choisit après, parce qu'un
 * rapport en porte des dizaines et qu'aucune n'est devinable depuis l'URL. Ouvrir un joueur
 * ne relance rien de neuf : c'est le chemin d'analyse par rapport déjà existant, avec le
 * `code`, la difficulté et l'acteur qu'on tient déjà.
 */
export function RaidForm({ onOpenPlayer, onBack }: RaidFormProps) {
  const [code, setCode] = useState('');
  const [fightID, setFightID] = useState<number | ''>('');
  const { meta, fetchedCode, loading: metaLoading, error: metaError, fetchMeta } = useReportMeta();
  const {
    ranking,
    loading: rankingLoading,
    error: rankingError,
    fetchRanking,
    reset: resetRanking,
  } = useRaidRanking();

  const fights = (meta?.fights ?? []).filter((f) => f.encounterID > 0);

  function handleLoadReport(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    setFightID('');
    resetRanking();
    void fetchMeta(trimmed);
  }

  function handleFightChange(id: number) {
    setFightID(id);
    if (fetchedCode && id) void fetchRanking(fetchedCode, id);
  }

  function handleOpen(player: RankedRaider) {
    if (!meta || !fetchedCode || !ranking) return;
    const actor = meta.actors.find((a) => a.id === player.actorId);
    if (!actor) return;
    // La spec du classement quand WCL la donne ; sinon le premier DPS de la classe, comme le
    // formulaire par rapport — mieux vaut une spec par défaut qu'un écran qui refuse d'ouvrir.
    const specId = player.specId ?? getDpsSpecsForClass(actor.subType)[0]?.specId;
    if (!specId) return;
    onOpenPlayer(
      fetchedCode,
      actor,
      specId,
      ranking.difficulty ?? 0,
      meta.fights,
      meta.actors,
      meta.title
    );
  }

  return (
    <div className="flex h-full justify-center overflow-y-auto px-6 py-10">
      <div className="w-full max-w-[720px]">
        <button
          type="button"
          onClick={onBack}
          className="text-dim hover:text-text mb-6 cursor-pointer border-none bg-transparent p-0 font-mono text-xs"
        >
          ← Back
        </button>

        <form onSubmit={handleLoadReport} className="flex flex-col gap-4">
          <Input
            label="WarcraftLogs Report Code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. aBcDeFgH12345678"
            disabled={metaLoading}
          />
          {metaError && <ErrorBanner message={metaError} />}
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={metaLoading || !code.trim()}
            className="w-fit tracking-wider uppercase"
          >
            {metaLoading ? 'Loading…' : 'Load Report'}
          </Button>
        </form>

        {meta && (
          <div className="mt-7 flex flex-col gap-4">
            <div className="text-dim font-mono text-xs">{meta.title}</div>
            <Select
              label="Pull"
              value={fightID}
              onChange={(e) => handleFightChange(Number(e.target.value))}
            >
              <option value="">— Choisir une pull —</option>
              {fights.map((f) => (
                <option key={f.id} value={f.id}>
                  {fightLabel(f)}
                </option>
              ))}
            </Select>

            {rankingError && <ErrorBanner message={rankingError} />}
            {rankingLoading && <LoadingSpinner label="Classement du raid…" />}
            {ranking && !rankingLoading && (
              <RaidRankingList ranking={ranking} onOpen={handleOpen} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
