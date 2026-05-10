'use client';

import type { AnalysisResult } from '@/types';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { useAIReport } from '@/hooks/useAIReport';
import { useApiKey } from '@/hooks/useApiKey';
import { StreamingText } from './StreamingText';

interface AIReportTabProps {
  analysisResult: AnalysisResult;
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  color: 'var(--text)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.85rem',
  padding: '8px 12px',
  width: '100%',
  outline: 'none',
};

export function AIReportTab({ analysisResult }: AIReportTabProps) {
  const [apiKey, setApiKey] = useApiKey();
  const { text, loading, error, start, reset } = useAIReport();

  function handleGenerate() {
    if (!apiKey.trim()) return;
    start(analysisResult, apiKey.trim());
  }

  return (
    <div style={{ padding: '24px 0', maxWidth: '760px' }}>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label
            style={{
              display: 'block',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              color: 'var(--gold-dim)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '6px',
            }}
          >
            Anthropic API Key
          </label>
          <input
            type="password"
            style={inputStyle}
            placeholder="sk-ant-…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={loading}
          />
        </div>
        {text ? (
          <button
            onClick={reset}
            disabled={loading}
            style={{
              padding: '8px 20px',
              background: 'var(--border)',
              border: 'none',
              borderRadius: '4px',
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={loading || !apiKey.trim()}
            style={{
              padding: '8px 20px',
              background: loading || !apiKey.trim() ? 'var(--border)' : 'var(--crimson)',
              border: 'none',
              borderRadius: '4px',
              color: 'var(--text)',
              fontFamily: 'var(--font-display)',
              fontSize: '0.95rem',
              cursor: loading || !apiKey.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Analysing…' : 'Analyse'}
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      {(text || loading) && (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: '4px',
            padding: '20px',
            background: 'var(--surface)',
            marginTop: '16px',
          }}
        >
          <StreamingText text={text} loading={loading} />
        </div>
      )}
    </div>
  );
}
