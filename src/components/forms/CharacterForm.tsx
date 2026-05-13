'use client';

import type { AnalysisInput, Zone } from '@/types';
import { useState } from 'react';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { EncounterSelector } from './EncounterSelector';

interface CharacterFormProps {
  onSubmit: (input: AnalysisInput, zoneId: number) => void;
  loading: boolean;
  zones: Zone[];
  zonesLoading: boolean;
  zonesError: string | null;
  defaultChar?: string;
  defaultServer?: string;
  defaultRegion?: AnalysisInput['region'];
  defaultDifficulty?: AnalysisInput['difficulty'];
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  color: 'var(--text)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.9rem',
  padding: '8px 12px',
  width: '100%',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.75rem',
  color: 'var(--gold-dim)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: '6px',
};

const fieldStyle: React.CSSProperties = {
  marginBottom: '18px',
};

export function CharacterForm({
  onSubmit,
  loading,
  zones,
  zonesLoading,
  zonesError,
  defaultChar = 'Jumbaa',
  defaultServer = 'ysondre',
  defaultRegion = 'EU',
  defaultDifficulty = 4,
}: CharacterFormProps) {
  const [characterName, setCharacterName] = useState(defaultChar);
  const [serverSlug, setServerSlug] = useState(defaultServer);
  const [region, setRegion] = useState<AnalysisInput['region']>(defaultRegion);
  const [difficulty, setDifficulty] = useState<AnalysisInput['difficulty']>(defaultDifficulty);
  // null = "all bosses in zone"; set = user explicitly toggled some off
  const [selectedEncounterIds, setSelectedEncounterIds] = useState<Set<number> | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);

  // Derive active zone without an effect — falls back to first zone when none selected
  const activeZoneId = selectedZoneId ?? zones[0]?.id ?? null;
  const currentZone = zones.find((z) => z.id === activeZoneId) ?? null;
  const encounters =
    selectedEncounterIds === null
      ? (currentZone?.encounters ?? [])
      : (currentZone?.encounters ?? []).filter((e) => selectedEncounterIds.has(e.id));

  function handleZoneChange(zoneId: number) {
    setSelectedZoneId(zoneId);
    setSelectedEncounterIds(null); // reset to all bosses on zone switch
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!characterName.trim() || !serverSlug.trim() || !activeZoneId || encounters.length === 0)
      return;
    onSubmit(
      {
        characterName: characterName.trim(),
        serverSlug: serverSlug.trim(),
        region,
        difficulty,
        encounters,
      },
      activeZoneId
    );
  }

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
        Feral Druid · WarcraftLogs analyser
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Character</label>
            <input
              style={inputStyle}
              type="text"
              placeholder="Jumbaa"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              required
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Realm</label>
            <input
              style={inputStyle}
              type="text"
              placeholder="ysondre"
              value={serverSlug}
              onChange={(e) => setServerSlug(e.target.value)}
              required
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Region</label>
            <select
              style={inputStyle}
              value={region}
              onChange={(e) => setRegion(e.target.value as AnalysisInput['region'])}
            >
              {(['US', 'EU', 'KR', 'TW', 'CN'] as const).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Difficulty</label>
            <select
              style={inputStyle}
              value={difficulty}
              onChange={(e) =>
                setDifficulty(Number.parseInt(e.target.value, 10) as AnalysisInput['difficulty'])
              }
            >
              <option value={5}>Mythic</option>
              <option value={4}>Heroic</option>
              <option value={3}>Normal</option>
            </select>
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
          disabled={loading || encounters.length === 0 || zonesLoading}
          style={{
            width: '100%',
            padding: '12px',
            background: loading || zonesLoading ? 'var(--border)' : 'var(--crimson)',
            color: 'var(--text)',
            border: 'none',
            borderRadius: '4px',
            fontFamily: 'var(--font-display)',
            fontSize: '1rem',
            cursor: loading || zonesLoading ? 'not-allowed' : 'pointer',
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
