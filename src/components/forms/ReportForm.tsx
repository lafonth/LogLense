'use client';

import type { ReportActor, ReportFight } from '@/types';
import { useState } from 'react';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { useReportMeta } from '@/hooks/useReportMeta';
import { getDpsSpecsForClass } from '@/lib/specs';
import { fieldStyle, inputStyle, labelStyle } from './formStyles';

const btnStyle: React.CSSProperties = {
  background: 'var(--gold-dim)',
  border: 'none',
  borderRadius: '4px',
  color: 'var(--bg)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.8rem',
  padding: '8px 20px',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
      }}
    >
      <div style={{ width: '100%', maxWidth: '480px' }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            cursor: 'pointer',
            marginBottom: '24px',
            padding: 0,
          }}
        >
          ← Back
        </button>

        <form onSubmit={handleLoadReport}>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="rf-code">
              WarcraftLogs Report Code
            </label>
            <input
              id="rf-code"
              style={inputStyle}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. aBcDeFgH12345678"
              disabled={metaLoading}
            />
          </div>
          {metaError && <ErrorBanner message={metaError} />}
          <button
            type="submit"
            disabled={metaLoading || !code.trim()}
            style={{
              ...btnStyle,
              cursor: metaLoading || !code.trim() ? 'not-allowed' : 'pointer',
              opacity: metaLoading || !code.trim() ? 0.6 : 1,
              marginBottom: '28px',
            }}
          >
            {metaLoading ? 'Loading…' : 'Load Report'}
          </button>
        </form>

        {meta && (
          <form onSubmit={handleSubmit}>
            <div style={fieldStyle}>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.78rem',
                  color: 'var(--text-dim)',
                  marginBottom: '16px',
                }}
              >
                {meta.title}
              </div>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="rf-actor">
                Character
              </label>
              <select
                id="rf-actor"
                style={inputStyle}
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
              </select>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="rf-difficulty">
                Difficulty
              </label>
              <select
                id="rf-difficulty"
                style={inputStyle}
                value={difficulty}
                onChange={(e) => setDifficulty(Number(e.target.value))}
              >
                <option value={5}>Mythic</option>
                <option value={4}>Heroic</option>
                <option value={3}>Normal</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={loading || selectedActorId === '' || !specId}
              style={{
                ...btnStyle,
                cursor: loading || selectedActorId === '' || !specId ? 'not-allowed' : 'pointer',
                opacity: loading || selectedActorId === '' || !specId ? 0.6 : 1,
              }}
            >
              {loading ? 'Analysing…' : 'Analyse'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
