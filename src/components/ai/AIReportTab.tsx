'use client';

import type { GroqModelId } from '@/lib/ai/groq';
import type { AnalysisResult, BossResult } from '@/types';

import { useEffect, useState } from 'react';

import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { useAIReport } from '@/hooks/useAIReport';
import { useApiKey } from '@/hooks/useApiKey';
import { DEFAULT_GROQ_MODEL, GROQ_MODELS } from '@/lib/ai/groq';
import { buildAnalysisPrompt } from '@/lib/ai/prompt';
import { StreamingText } from './StreamingText';

interface AIReportTabProps {
  analysisResult: AnalysisResult;
}

type Provider = 'claude' | 'gemini' | 'groq';

const PROVIDERS: {
  id: Provider;
  label: string;
  keyLabel: string;
  placeholder: string;
  keyHint: string;
}[] = [
  {
    id: 'groq',
    label: 'Groq',
    keyLabel: 'Groq API Key',
    placeholder: 'gsk_…',
    keyHint: 'console.groq.com — free tier',
  },
  {
    id: 'gemini',
    label: 'Gemini Flash',
    keyLabel: 'Google AI Studio Key',
    placeholder: 'AIza…',
    keyHint: 'aistudio.google.com — free tier',
  },
  {
    id: 'claude',
    label: 'Claude',
    keyLabel: 'Anthropic API Key',
    placeholder: 'sk-ant-…',
    keyHint: 'console.anthropic.com',
  },
];

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

function useProvider(): [Provider, (p: Provider) => void] {
  const [provider, setProvider] = useState<Provider>(() => {
    if (typeof window === 'undefined') return 'gemini';
    return (localStorage.getItem('loglense_ai_provider') as Provider | null) ?? 'groq';
  });

  function persist(p: Provider) {
    setProvider(p);
    localStorage.setItem('loglense_ai_provider', p);
  }

  return [provider, persist];
}

export function AIReportTab({ analysisResult }: AIReportTabProps) {
  const [provider, setProvider] = useProvider();
  const [claudeKey, setClaudeKey] = useApiKey('loglense_api_key');
  const [geminiKey, setGeminiKey] = useApiKey('loglense_gemini_key');
  const [groqKey, setGroqKey] = useApiKey('loglense_groq_key');
  const [serverProviders, setServerProviders] = useState<string[]>([]);
  const [selectedBossIdx, setSelectedBossIdx] = useState<number>(() => {
    const first = analysisResult.bosses.findIndex((b) => b !== null);
    return first >= 0 ? first : 0;
  });
  const [groqModel, setGroqModel] = useState<GroqModelId>(() => {
    if (typeof window === 'undefined') return DEFAULT_GROQ_MODEL;
    return (
      (localStorage.getItem('loglense_groq_model') as GroqModelId | null) ?? DEFAULT_GROQ_MODEL
    );
  });
  const { text, usage, loading, error, start, reset } = useAIReport();

  useEffect(() => {
    fetch('/api/ai-report')
      .then((r) => r.json())
      .then((d: { configuredProviders: string[] }) => setServerProviders(d.configuredProviders))
      .catch(() => {});
  }, []);

  const active = PROVIDERS.find((p) => p.id === provider)!;
  const serverHasKey = serverProviders.includes(provider);
  const apiKey = provider === 'claude' ? claudeKey : provider === 'groq' ? groqKey : geminiKey;
  const setApiKey =
    provider === 'claude' ? setClaudeKey : provider === 'groq' ? setGroqKey : setGeminiKey;

  const availableBosses = analysisResult.bosses
    .map((b, i) => ({ boss: b, idx: i }))
    .filter((x): x is { boss: BossResult; idx: number } => x.boss !== null);

  function buildPayload(): AnalysisResult {
    return {
      ...analysisResult,
      bosses: [analysisResult.bosses[selectedBossIdx]],
    };
  }

  function handleGenerate() {
    if (!serverHasKey && !apiKey.trim()) return;
    start(buildPayload(), apiKey.trim(), provider, provider === 'groq' ? groqModel : undefined);
  }

  function handleDownloadPrompt() {
    const prompt = buildAnalysisPrompt(buildPayload());
    const blob = new Blob([prompt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ai-prompt.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleGroqModelChange(id: GroqModelId) {
    setGroqModel(id);
    localStorage.setItem('loglense_groq_model', id);
    reset();
  }

  function handleBossChange(value: string) {
    reset();
    setSelectedBossIdx(Number(value));
  }

  const canGenerate = serverHasKey || !!apiKey.trim();

  return (
    <div style={{ padding: '24px 0', maxWidth: '760px' }}>
      {/* Provider toggle */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            onClick={() => setProvider(p.id)}
            disabled={loading}
            style={{
              padding: '5px 14px',
              background: provider === p.id ? 'var(--surface)' : 'transparent',
              border: `1px solid ${provider === p.id ? 'var(--gold-dim)' : 'var(--border)'}`,
              borderRadius: '4px',
              color: provider === p.id ? 'var(--gold)' : 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Groq model selector */}
      {provider === 'groq' && (
        <div style={{ marginBottom: '16px' }}>
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
            Model
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {GROQ_MODELS.map((m) => (
              <label
                key={m.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.82rem',
                  color: groqModel === m.id ? 'var(--text)' : 'var(--text-dim)',
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="groq-model"
                  value={m.id}
                  checked={groqModel === m.id}
                  disabled={loading}
                  onChange={() => handleGroqModelChange(m.id)}
                  style={{ accentColor: 'var(--gold)' }}
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Boss selector */}
      {availableBosses.length > 1 && (
        <div style={{ marginBottom: '16px' }}>
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
            Boss
          </label>
          <select
            value={String(selectedBossIdx)}
            onChange={(e) => handleBossChange(e.target.value)}
            disabled={loading}
            style={{ ...inputStyle, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {availableBosses.map(({ boss, idx }) => (
              <option key={idx} value={String(idx)}>
                {boss.encounter}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Key input + action */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '24px',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1 }}>
          {serverHasKey ? (
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.78rem',
                color: 'var(--text-dim)',
                margin: 0,
              }}
            >
              <span style={{ color: 'var(--gold-dim)', marginRight: '6px' }}>●</span>
              {active.keyLabel} configured on server
            </p>
          ) : (
            <>
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
                {active.keyLabel}
                <span
                  style={{
                    marginLeft: '8px',
                    color: 'var(--text-dim)',
                    textTransform: 'none',
                    letterSpacing: 0,
                  }}
                >
                  — {active.keyHint}
                </span>
              </label>
              <input
                type="password"
                style={inputStyle}
                placeholder={active.placeholder}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={loading}
              />
            </>
          )}
        </div>
        <button
          onClick={handleDownloadPrompt}
          disabled={loading}
          title="Download the prompt that will be sent to the AI"
          style={{
            padding: '8px 14px',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.78rem',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          ↓ prompt
        </button>
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
            disabled={loading || !canGenerate}
            style={{
              padding: '8px 20px',
              background: loading || !canGenerate ? 'var(--border)' : 'var(--crimson)',
              border: 'none',
              borderRadius: '4px',
              color: 'var(--text)',
              fontFamily: 'var(--font-display)',
              fontSize: '0.95rem',
              cursor: loading || !canGenerate ? 'not-allowed' : 'pointer',
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

      {usage && !loading && (
        <details
          style={{
            marginTop: '12px',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            background: 'var(--surface)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.78rem',
          }}
        >
          <summary
            style={{
              padding: '8px 14px',
              cursor: 'pointer',
              color: 'var(--text-dim)',
              userSelect: 'none',
              listStyle: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span style={{ color: 'var(--gold-dim)' }}>◂</span>
            Analysis metadata
          </summary>
          <div
            style={{
              padding: '12px 16px',
              borderTop: '1px solid var(--border)',
              display: 'grid',
              gridTemplateColumns: 'max-content 1fr',
              gap: '4px 20px',
              color: 'var(--text-dim)',
            }}
          >
            <span style={{ color: 'var(--text-dim)' }}>Model</span>
            <span style={{ color: 'var(--text)' }}>{usage.model}</span>

            <span>Prompt tokens</span>
            <span style={{ color: 'var(--text)' }}>{usage.promptTokens.toLocaleString()}</span>

            <span>Completion tokens</span>
            <span style={{ color: 'var(--text)' }}>{usage.completionTokens.toLocaleString()}</span>

            <span>Total tokens</span>
            <span style={{ color: 'var(--text)' }}>{usage.totalTokens.toLocaleString()}</span>

            <span>Context window</span>
            <span style={{ color: 'var(--text)' }}>
              {usage.contextWindow.toLocaleString()}{' '}
              <span style={{ color: 'var(--text-dim)' }}>
                ({((usage.totalTokens / usage.contextWindow) * 100).toFixed(1)}% used)
              </span>
            </span>
          </div>
        </details>
      )}
    </div>
  );
}
