'use client';

import type { BossState } from '@/hooks/useAnalysis';
import type { Provider } from '@/lib/ai/catalog';
import type { GroqModelId } from '@/lib/ai/groq';
import type { AnalysisInput, AnalysisResult, BossResult } from '@/types';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useAIReport } from '@/hooks/useAIReport';
import { useProvider } from '@/hooks/useProvider';
import { useProviderKeys } from '@/hooks/useProviderKeys';
import { providerInfo, PROVIDERS } from '@/lib/ai/catalog';
import { DEFAULT_GROQ_MODEL, GROQ_MODELS } from '@/lib/ai/groq';
import { buildAnalysisPrompt } from '@/lib/ai/prompt';
import { getSpecInfo } from '@/lib/specs';
import { ReportFeedback } from './ReportFeedback';
import { StreamingText } from './StreamingText';

interface AIReportTabProps {
  bossStates: BossState[];
  input: AnalysisInput;
  activeBossResult: BossResult | null;
}

export function AIReportTab({ bossStates, input, activeBossResult }: AIReportTabProps) {
  const [provider, setProvider] = useProvider('loglense_ai_provider', PROVIDERS, 'groq');
  const [apiKey, setApiKey] = useProviderKeys()[provider];
  const [serverProviders, setServerProviders] = useState<string[]>([]);
  const [selectedBossIdx, setSelectedBossIdx] = useState<number>(() => {
    const first = bossStates.findIndex((s) => s.status === 'success' && s.result !== null);
    return first >= 0 ? first : 0;
  });
  const [groqModel, setGroqModel] = useState<GroqModelId>(() => {
    if (typeof window === 'undefined') return DEFAULT_GROQ_MODEL;
    // Un modèle choisi lors d'une visite précédente peut avoir été retiré de chez Groq depuis :
    // le relire sans le confronter à la table le renvoie tel quel, et la route le refuse en 400.
    const stored = localStorage.getItem('loglense_groq_model');
    return GROQ_MODELS.some((m) => m.id === stored) ? (stored as GroqModelId) : DEFAULT_GROQ_MODEL;
  });
  const { text, usage, loading, error, start, reset } = useAIReport();

  /*
   * Le boss de la barre latérale devient celui du rapport, mais l'utilisateur garde le
   * droit d'en choisir un autre ici : on ne resynchronise donc qu'au changement de boss
   * actif, d'où l'encounter déjà synchronisé gardé en état.
   *
   * L'ajustement se fait pendant le rendu, pas dans un effet. Un effet aurait rendu une
   * première fois avec le mauvais boss sélectionné avant de se corriger — visible, et
   * suffisant pour que le bouton d'analyse parte sur le mauvais payload si on le presse
   * assez vite.
   */
  const [syncedEncounterId, setSyncedEncounterId] = useState<number | null>(null);
  if (activeBossResult && activeBossResult.encounterId !== syncedEncounterId) {
    setSyncedEncounterId(activeBossResult.encounterId);
    const idx = bossStates.findIndex(
      (s) => s.status === 'success' && s.result?.encounterId === activeBossResult.encounterId
    );
    if (idx >= 0) setSelectedBossIdx(idx);
  }

  useEffect(() => {
    fetch('/api/ai-report')
      .then((r) => r.json())
      .then((d: { configuredProviders: string[] }) => setServerProviders(d.configuredProviders))
      .catch(() => {});
  }, []);

  const active = providerInfo(provider);
  const serverHasKey = serverProviders.includes(provider);

  const availableBosses = bossStates
    .map((s, i) => ({
      boss: s.status === 'success' && s.result ? s.result : null,
      idx: i,
    }))
    .filter((x): x is { boss: BossResult; idx: number } => x.boss !== null);

  function buildPayload(): AnalysisResult {
    const bossState = bossStates[selectedBossIdx];
    const boss = bossState?.status === 'success' ? bossState.result : null;
    return {
      input,
      bosses: [boss],
      generatedAt: new Date().toISOString(),
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

  // Le boss dont le rapport parle, pas celui de la barre latérale : c'est son `renderId` que
  // le serveur a enregistré en empreinte du conseil.
  const reportedState = bossStates[selectedBossIdx];
  const reportedBoss = reportedState?.status === 'success' ? reportedState.result : null;

  return (
    <div className="max-w-[760px] py-6">
      {/* Provider picker */}
      <div className="mb-4">
        <Select
          label="Provider"
          value={provider}
          disabled={loading}
          onChange={(e) => setProvider(e.target.value as Provider)}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </div>

      {/* Groq model selector */}
      {provider === 'groq' && (
        <div className="mb-4">
          <span className="text-2xs text-muted mb-1.5 block font-mono tracking-wider uppercase">
            Model
          </span>
          <div className="flex flex-col gap-1.5">
            {GROQ_MODELS.map((m) => (
              <label
                key={m.id}
                className={`flex items-center gap-2 font-mono text-sm ${
                  groqModel === m.id ? 'text-text' : 'text-dim'
                } ${loading ? 'cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <input
                  type="radio"
                  name="groq-model"
                  value={m.id}
                  checked={groqModel === m.id}
                  disabled={loading}
                  onChange={() => handleGroqModelChange(m.id)}
                  className="accent-brass"
                />
                {m.label}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Boss selector */}
      {availableBosses.length > 1 && (
        <div className="mb-4">
          <Select
            label="Boss"
            value={String(selectedBossIdx)}
            disabled={loading}
            onChange={(e) => handleBossChange(e.target.value)}
          >
            {availableBosses.map(({ boss, idx }) => {
              const spec = getSpecInfo(boss.specId);
              return (
                <option key={idx} value={String(idx)}>
                  {boss.encounter}
                  {spec ? ` — ${spec.specName}` : ''}
                </option>
              );
            })}
          </Select>
        </div>
      )}

      {/* Key input + action */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          {serverHasKey ? (
            <p className="text-dim m-0 font-mono text-xs">
              <span className="text-muted mr-1.5">●</span>
              {active.keyLabel} configured on server
            </p>
          ) : (
            <Input
              type="password"
              label={`${active.keyLabel} — ${active.keyHint}`}
              placeholder={active.placeholder}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={loading}
            />
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDownloadPrompt}
          disabled={loading}
          title="Download the prompt that will be sent to the AI"
          className="border-border text-dim font-mono whitespace-nowrap"
        >
          ↓ prompt
        </Button>
        {text ? (
          <Button variant="secondary" size="md" onClick={reset} disabled={loading}>
            Reset
          </Button>
        ) : (
          <Button
            variant="primary"
            size="md"
            onClick={handleGenerate}
            disabled={loading || !canGenerate}
          >
            {loading ? 'Analysing…' : 'Analyse'}
          </Button>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      {(text || loading) && (
        <div className="border-border bg-surface mt-4 rounded-sm border p-6">
          <StreamingText text={text} loading={loading} />
        </div>
      )}

      {/*
        Après la fin du flux seulement : un jugement porté sur un texte encore en train de
        s'écrire ne porte pas sur le rapport, et il s'enregistrerait quand même.
      */}
      {text && !loading && reportedBoss && (
        <ReportFeedback key={reportedBoss.renderId} boss={reportedBoss} />
      )}

      {usage && !loading && (
        <details className="border-border bg-surface mt-3 rounded-sm border font-mono text-xs">
          <summary className="text-dim flex cursor-pointer list-none items-center gap-2 px-4 py-2 select-none">
            <span className="text-muted">◂</span>
            Analysis metadata
          </summary>
          <div className="border-border text-dim grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 border-t px-4 py-3">
            <span className="text-dim">Model</span>
            <span className="text-text">{usage.model}</span>

            <span>Prompt tokens</span>
            <span className="text-text">{usage.promptTokens.toLocaleString()}</span>

            <span>Completion tokens</span>
            <span className="text-text">{usage.completionTokens.toLocaleString()}</span>

            <span>Total tokens</span>
            <span className="text-text">{usage.totalTokens.toLocaleString()}</span>

            <span>Context window</span>
            <span className="text-text">
              {usage.contextWindow.toLocaleString()}{' '}
              <span className="text-dim">
                ({((usage.totalTokens / usage.contextWindow) * 100).toFixed(1)}% used)
              </span>
            </span>
          </div>
        </details>
      )}
    </div>
  );
}
