'use client';

import type { RealmSelection } from '@/components/forms/RealmAutocomplete';
import type { AnalysisInput, Zone } from '@/types';
import { useState } from 'react';
import { RealmAutocomplete } from '@/components/forms/RealmAutocomplete';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { DifficultyRegionFields } from './DifficultyRegionFields';
import { EncounterSelector } from './EncounterSelector';
import { fieldStyle, inputStyle, labelStyle } from './formStyles';

interface CharacterFormProps {
  onSubmit: (input: AnalysisInput, zoneId: number) => void;
  loading: boolean;
  zones: Zone[];
  zonesLoading: boolean;
  zonesError: string | null;
}

export function CharacterForm({
  onSubmit,
  loading,
  zones,
  zonesLoading,
  zonesError,
}: CharacterFormProps) {
  const [characterName, setCharacterName] = useState('');
  const [realm, setRealm] = useState<RealmSelection | null>(null);
  const [region, setRegion] = useState<AnalysisInput['region']>('EU');
  const [difficulty, setDifficulty] = useState<AnalysisInput['difficulty']>(4);
  const [selectedEncounterIds, setSelectedEncounterIds] = useState<Set<number> | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);

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
    if (!characterName.trim() || !realm || !activeZoneId || encounters.length === 0) return;
    onSubmit(
      {
        characterName: characterName.trim(),
        serverSlug: realm.slug,
        region,
        difficulty,
        encounters,
      },
      activeZoneId
    );
  }

  const canSubmit =
    !!characterName.trim() && !!realm && encounters.length > 0 && !zonesLoading && !loading;

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        background: 'radial-gradient(ellipse at 50% 0%, rgba(198,168,74,0.06) 0%, var(--bg) 60%)',
      }}
    >
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '3rem',
          color: 'var(--gold)',
          marginBottom: '8px',
          letterSpacing: '0.04em',
        }}
      >
        LogLense
      </h1>
      <p
        style={{
          color: 'var(--text-dim)',
          fontSize: '0.85rem',
          marginBottom: '40px',
          fontFamily: 'var(--font-mono)',
        }}
      >
        WarcraftLogs analyser
      </p>

      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: '520px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          padding: '32px',
        }}
      >
        <DifficultyRegionFields
          region={region}
          difficulty={difficulty}
          onRegionChange={handleRegionChange}
          onDifficultyChange={setDifficulty}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Character</label>
            <input
              style={inputStyle}
              type="text"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              placeholder="Jumbaa"
              autoComplete="off"
            />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Realm</label>
            <RealmAutocomplete
              key={region}
              region={region}
              value={realm}
              onChange={setRealm}
              inputStyle={inputStyle}
            />
          </div>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Raid</label>
          {zonesLoading ? (
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.82rem',
                color: 'var(--text-dim)',
                padding: '8px 0',
              }}
            >
              Loading raids…
            </div>
          ) : zonesError ? (
            <ErrorBanner message={zonesError} />
          ) : (
            <select
              style={inputStyle}
              value={selectedZoneId ?? ''}
              onChange={(e) => handleZoneChange(Number.parseInt(e.target.value, 10))}
            >
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {currentZone && (
          <div style={fieldStyle}>
            <label style={labelStyle}>Bosses</label>
            <EncounterSelector
              available={currentZone.encounters}
              selected={encounters}
              onChange={(encs) => setSelectedEncounterIds(new Set(encs.map((e) => e.id)))}
            />
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            width: '100%',
            padding: '12px',
            background: canSubmit ? 'var(--crimson)' : 'var(--border)',
            color: 'var(--text)',
            border: 'none',
            borderRadius: '4px',
            fontFamily: 'var(--font-display)',
            fontSize: '1rem',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            letterSpacing: '0.06em',
            marginTop: '8px',
          }}
        >
          {loading ? 'Analysing…' : 'Analyse'}
        </button>
      </form>
    </div>
  );
}
