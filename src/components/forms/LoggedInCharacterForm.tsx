'use client';

import type { AnalysisInput, Zone } from '@/types';
import { useEffect, useState } from 'react';
import { EncounterSelector } from '@/components/forms/EncounterSelector';
import { ErrorBanner } from '@/components/ui/ErrorBanner';

interface WowCharacter {
  id: number;
  name: string;
  realmName: string;
  realmSlug: string;
  class: string;
  level: number;
}

interface LoggedInCharacterFormProps {
  onSubmit: (input: AnalysisInput, zoneId: number) => void;
  loading: boolean;
  zones: Zone[];
  zonesLoading: boolean;
  zonesError: string | null;
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

const fieldStyle: React.CSSProperties = { marginBottom: '18px' };

export function LoggedInCharacterForm({
  onSubmit,
  loading,
  zones,
  zonesLoading,
  zonesError,
}: LoggedInCharacterFormProps) {
  const [region, setRegion] = useState<AnalysisInput['region']>('EU');
  const [characters, setCharacters] = useState<WowCharacter[]>([]);
  const [charsLoading, setCharsLoading] = useState(false);
  const [selectedChar, setSelectedChar] = useState<WowCharacter | null>(null);
  const [difficulty, setDifficulty] = useState<AnalysisInput['difficulty']>(4);
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [selectedEncounterIds, setSelectedEncounterIds] = useState<Set<number> | null>(null);

  const activeZoneId = selectedZoneId ?? zones[0]?.id ?? null;
  const currentZone = zones.find((z) => z.id === activeZoneId) ?? null;
  const encounters =
    selectedEncounterIds === null
      ? (currentZone?.encounters ?? [])
      : (currentZone?.encounters ?? []).filter((e) => selectedEncounterIds.has(e.id));

  useEffect(() => {
    setCharsLoading(true);
    setSelectedChar(null);
    void fetch(`/api/user/characters?region=${region}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => { setCharacters(data as WowCharacter[]); })
      .catch(() => { setCharacters([]); })
      .finally(() => { setCharsLoading(false); });
  }, [region]);

  function handleZoneChange(zoneId: number) {
    setSelectedZoneId(zoneId);
    setSelectedEncounterIds(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedChar || !activeZoneId || encounters.length === 0) return;
    onSubmit(
      {
        characterName: selectedChar.name,
        serverSlug: selectedChar.realmSlug,
        region,
        difficulty,
        encounters,
      },
      activeZoneId
    );
  }

  const canSubmit = !!selectedChar && encounters.length > 0 && !zonesLoading && !loading;

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
          maxWidth: '560px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          padding: '32px',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Region</label>
            <select
              style={inputStyle}
              value={region}
              onChange={(e) => setRegion(e.target.value as AnalysisInput['region'])}
            >
              {(['US', 'EU', 'KR', 'TW', 'CN'] as const).map((r) => (
                <option key={r} value={r}>{r}</option>
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
          <label style={labelStyle}>
            Your Characters
            {charsLoading && (
              <span style={{ marginLeft: '8px', color: 'var(--text-dim)', opacity: 0.6, textTransform: 'none' }}>
                Loading…
              </span>
            )}
          </label>
          {!charsLoading && characters.length === 0 ? (
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.82rem',
                color: 'var(--text-dim)',
                padding: '8px 0',
              }}
            >
              No characters found for this region.
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                gap: '6px',
                maxHeight: '210px',
                overflowY: 'auto',
              }}
            >
              {characters.map((c) => {
                const isActive = selectedChar?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedChar(c)}
                    style={{
                      padding: '8px 10px',
                      background: isActive ? 'rgba(198,168,74,0.08)' : 'transparent',
                      border: isActive ? '1px solid var(--gold-dim)' : '1px solid var(--border)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.82rem',
                        color: isActive ? 'var(--gold)' : 'var(--text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {c.name}-{c.realmName}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.68rem',
                        color: 'var(--text-dim)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {c.class}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
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
                <option key={z.id} value={z.id}>{z.name}</option>
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
