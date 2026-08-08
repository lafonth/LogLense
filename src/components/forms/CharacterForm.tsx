'use client';

import type { RealmSelection } from '@/components/forms/RealmAutocomplete';
import type { AnalysisInput, Zone } from '@/types';
import { useState } from 'react';
import { RealmAutocomplete } from '@/components/forms/RealmAutocomplete';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { DifficultyRegionFields } from './DifficultyRegionFields';
import { EncounterSelector } from './EncounterSelector';
import { SpecSelector } from './SpecSelector';

interface CharacterFormProps {
  onSubmit: (input: AnalysisInput, zoneId: number) => void;
  loading: boolean;
  zones: Zone[];
  zonesLoading: boolean;
  zonesError: string | null;
  onZonesRetry?: () => void;
}

export function CharacterForm({
  onSubmit,
  loading,
  zones,
  zonesLoading,
  zonesError,
  onZonesRetry,
}: CharacterFormProps) {
  const [characterName, setCharacterName] = useState('');
  const [realm, setRealm] = useState<RealmSelection | null>(null);
  const [region, setRegion] = useState<AnalysisInput['region']>('EU');
  const [difficulty, setDifficulty] = useState<AnalysisInput['difficulty']>(4);
  const [selectedEncounterIds, setSelectedEncounterIds] = useState<Set<number> | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [specId, setSpecId] = useState<number | null>(null);

  const activeZoneId = selectedZoneId ?? zones[0]?.id ?? null;
  const currentZone = zones.find((z) => z.id === activeZoneId) ?? null;
  const encounters =
    selectedEncounterIds === null
      ? (currentZone?.encounters ?? [])
      : (currentZone?.encounters ?? []).filter((e) => selectedEncounterIds.has(e.id));

  function handleZoneChange(zoneId: number) {
    setSelectedZoneId(zoneId);
    setSelectedEncounterIds(null);
  }

  function handleRegionChange(r: AnalysisInput['region']) {
    setRegion(r);
    setRealm(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!characterName.trim() || !realm || !specId || !activeZoneId || encounters.length === 0)
      return;
    onSubmit(
      {
        characterName: characterName.trim(),
        serverSlug: realm.slug,
        region,
        difficulty,
        encounters,
        specId,
      },
      activeZoneId
    );
  }

  const canSubmit =
    !!characterName.trim() &&
    !!realm &&
    !!specId &&
    encounters.length > 0 &&
    !zonesLoading &&
    !loading;

  return (
    <div className="flex h-full flex-col items-center justify-center px-5 py-10">
      <h1 className="font-display text-brass mb-2 text-4xl tracking-wide">LogLense</h1>
      <p className="text-dim mb-10 font-mono text-xs">WarcraftLogs analyser</p>

      <form
        onSubmit={handleSubmit}
        className="border-border bg-surface w-full max-w-[520px] rounded-sm border p-8"
      >
        <div className="flex flex-col gap-4">
          <DifficultyRegionFields
            region={region}
            difficulty={difficulty}
            onRegionChange={handleRegionChange}
            onDifficultyChange={setDifficulty}
          />

          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <Input
              label="Character"
              type="text"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              placeholder="Jumbaa"
              autoComplete="off"
            />
            <RealmAutocomplete key={region} region={region} value={realm} onChange={setRealm} />
          </div>

          <SpecSelector specId={specId} onChange={setSpecId} />

          <div>
            {zonesLoading ? (
              <>
                <div className="text-2xs text-muted mb-1.5 font-sans tracking-widest uppercase">
                  Raid
                </div>
                <div className="text-dim py-2 font-mono text-xs">Loading raids…</div>
              </>
            ) : zonesError ? (
              <>
                <div className="text-2xs text-muted mb-1.5 font-sans tracking-widest uppercase">
                  Raid
                </div>
                <ErrorBanner message={zonesError} onRetry={onZonesRetry} />
              </>
            ) : (
              <Select
                label="Raid"
                value={selectedZoneId ?? ''}
                onChange={(e) => handleZoneChange(Number.parseInt(e.target.value, 10))}
              >
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </Select>
            )}
          </div>

          {currentZone && (
            <div>
              <div className="text-2xs text-muted mb-1.5 font-sans tracking-widest uppercase">
                Bosses
              </div>
              <EncounterSelector
                available={currentZone.encounters}
                selected={encounters}
                onChange={(encs) => setSelectedEncounterIds(new Set(encs.map((e) => e.id)))}
              />
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={!canSubmit}
            className="w-full tracking-wider uppercase"
          >
            {loading ? 'Analysing…' : 'Analyse'}
          </Button>
        </div>
      </form>
    </div>
  );
}
