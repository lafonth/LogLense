'use client';

import type { AnalysisInput, Encounter } from '@/types';
import { useState } from 'react';
import { EncounterSelector } from './EncounterSelector';

const TWW_S2_DEFAULTS: Encounter[] = [
  { id: 2902, name: 'Ulgrax the Devourer' },
  { id: 2917, name: 'The Bloodbound Horror' },
  { id: 2898, name: 'Sikran, Captain of the Sureki' },
  { id: 2918, name: "Rasha'nan" },
  { id: 2919, name: "Eggtender Ovi'nax" },
  { id: 2920, name: "Nexus-Princess Ky'veza" },
  { id: 2921, name: 'The Silken Court' },
  { id: 2922, name: 'Queen Ansurek' },
];

interface CharacterFormProps {
  onSubmit: (input: AnalysisInput) => void;
  loading: boolean;
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

export function CharacterForm({ onSubmit, loading }: CharacterFormProps) {
  const [characterName, setCharacterName] = useState('');
  const [serverSlug, setServerSlug] = useState('');
  const [region, setRegion] = useState<AnalysisInput['region']>('EU');
  const [difficulty, setDifficulty] = useState<AnalysisInput['difficulty']>(5);
  const [encounters, setEncounters] = useState<Encounter[]>(TWW_S2_DEFAULTS);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!characterName.trim() || !serverSlug.trim() || encounters.length === 0) return;
    onSubmit({
      characterName: characterName.trim(),
      serverSlug: serverSlug.trim(),
      region,
      difficulty,
      encounters,
    });
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

        <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Bosses</label>
          <EncounterSelector selected={encounters} onChange={setEncounters} />
        </div>

        <button
          type="submit"
          disabled={loading || encounters.length === 0}
          style={{
            width: '100%',
            padding: '12px',
            background: loading ? 'var(--border)' : 'var(--crimson)',
            color: 'var(--text)',
            border: 'none',
            borderRadius: '4px',
            fontFamily: 'var(--font-display)',
            fontSize: '1rem',
            cursor: loading ? 'not-allowed' : 'pointer',
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
