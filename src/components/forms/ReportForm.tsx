'use client';

import type { ReportActor, ReportFight } from '@/types';
import { useState } from 'react';
import { BackLink } from '@/components/ui/BackLink';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useReportMeta } from '@/hooks/useReportMeta';
import { getDpsSpecsForClass } from '@/lib/specs';

interface ReportFormProps {
  onSubmit: (
    code: string,
    actor: ReportActor,
    specId: number,
    difficulty: number,
    fights: ReportFight[],
    actors: ReportActor[],
    title: string
  ) => void;
  loading: boolean;
  onBack: () => void;
}

export function ReportForm({ onSubmit, loading, onBack }: ReportFormProps) {
  const [code, setCode] = useState('');
  const [selectedActorId, setSelectedActorId] = useState<number | ''>('');
  const [specId, setSpecId] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<number>(5);
  const { meta, loading: metaLoading, error: metaError, fetchMeta } = useReportMeta();

  function handleLoadReport(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (trimmed) void fetchMeta(trimmed);
  }

  function handleActorChange(id: number) {
    setSelectedActorId(id);
    const actor = meta?.actors.find((a) => a.id === id);
    if (actor) {
      const specs = getDpsSpecsForClass(actor.subType);
      setSpecId(specs[0]?.specId ?? null);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!meta || selectedActorId === '' || !specId) return;
    const actor = meta.actors.find((a) => a.id === selectedActorId);
    if (!actor) return;
    onSubmit(code.trim(), actor, specId, difficulty, meta.fights, meta.actors, meta.title);
  }

  return (
    <div className="flex h-full items-center justify-center px-6 py-10">
      <div className="w-full max-w-[480px]">
        <BackLink onClick={onBack} />

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
          <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
            <div className="text-dim font-mono text-xs">{meta.title}</div>
            <Select
              label="Character"
              value={selectedActorId}
              onChange={(e) => handleActorChange(Number(e.target.value))}
            >
              <option value="">— Select a character —</option>
              {meta.actors
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.subType})
                  </option>
                ))}
            </Select>
            <Select
              label="Difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(Number(e.target.value))}
            >
              <option value={5}>Mythic</option>
              <option value={4}>Heroic</option>
              <option value={3}>Normal</option>
            </Select>
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={loading || selectedActorId === '' || !specId}
              className="w-fit tracking-wider uppercase"
            >
              {loading ? 'Analysing…' : 'Analyse'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
