'use client';

import type { Provider } from '@/lib/ai/catalog';
import type { BossResult } from '@/types';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useChat } from '@/hooks/useChat';
import { useProvider } from '@/hooks/useProvider';
import { useProviderKeys } from '@/hooks/useProviderKeys';
import { CHAT_PROVIDERS, providerInfo } from '@/lib/ai/catalog';
import { StreamingText } from './StreamingText';

interface ChatTabProps {
  boss: BossResult | null;
}

/**
 * Amorces de conversation. Toutes du côté gratuit de la resélection : elles rejouent la cohorte
 * sur l'échantillon déjà en instantané, sans une seule requête chez Warcraft Logs. Ce sont
 * aussi les questions que rien d'autre ne sait répondre, donc celles à montrer en premier.
 */
const SUGGESTIONS = [
  'Rebuild the cohort with 4-piece wearers only — what changes?',
  'Keep only kills under five minutes.',
  'Keep only references within 2 ilvl of me.',
  'Include the disqualified candidates and tell me what it changes.',
];

export function ChatTab({ boss }: ChatTabProps) {
  // Son propre choix, et sa propre clé de stockage : le rapport peut rester sur Groq, que le
  // chat refuse. Un seul réglage partagé ouvrirait le chat sur un fournisseur que la route 400.
  const [provider, setProvider] = useProvider('loglense_chat_provider', CHAT_PROVIDERS, 'claude');
  const [apiKey, setApiKey] = useProviderKeys()[provider];
  const [serverProviders, setServerProviders] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const { messages, usage, loading, error, send, reset } = useChat(
    boss?.snapshot,
    apiKey.trim(),
    provider
  );
  const endRef = useRef<HTMLDivElement>(null);

  // `/api/chat` et non `/api/ai-report` : le rapport annonce aussi Groq, que le chat ne sert pas.
  useEffect(() => {
    fetch('/api/chat')
      .then((r) => r.json())
      .then((d: { configuredProviders: string[] }) => setServerProviders(d.configuredProviders))
      .catch(() => {});
  }, []);

  // Le flux écrit dans le dernier message : sans ça, la réponse s'écrit sous le pli et il faut
  // suivre à la molette pendant qu'elle arrive.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  if (!boss) {
    return (
      <p className="text-dim max-w-[70ch] py-6 font-sans text-sm">
        Analyse a boss first — the chat reads that analysis and nothing else.
      </p>
    );
  }

  if (!boss.snapshot) {
    return (
      <p className="text-dim max-w-[70ch] py-6 font-sans text-sm">
        This result was produced before the chat existed. Run the analysis again to chat about it.
      </p>
    );
  }

  const active = providerInfo(provider);
  const serverHasKey = serverProviders.includes(provider);
  const canSend = serverHasKey || !!apiKey.trim();

  function submit(text: string) {
    if (!canSend) return;
    setDraft('');
    void send(text);
  }

  return (
    <div className="max-w-[760px] py-6">
      <p className="text-dim mb-4 max-w-[70ch] font-sans text-sm leading-relaxed">
        Ask about this pull&apos;s damage and rotation, or rebuild the reference cohort on other
        criteria — set bonus, kill time, ilvl. Survival, defensives and boss mechanics are out of
        scope: we do not read them, so we do not comment on them.
      </p>

      <div className="mb-4">
        <Select
          label="Provider"
          value={provider}
          disabled={loading}
          onChange={(e) => setProvider(e.target.value as Provider)}
        >
          {CHAT_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="mb-4">
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

      {messages.length === 0 && (
        <div className="mb-4 flex flex-col items-start gap-2">
          {SUGGESTIONS.map((s) => (
            <Button
              key={s}
              variant="ghost"
              size="sm"
              disabled={loading || !canSend}
              onClick={() => submit(s)}
              className="border-border text-dim text-left"
            >
              {s}
            </Button>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <div className="mb-4 flex flex-col gap-4">
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div
                key={m.id}
                className="border-border bg-surface-raised text-text self-end rounded-sm border px-4 py-2 font-sans text-sm leading-relaxed whitespace-pre-wrap"
              >
                {m.text}
              </div>
            ) : (
              <div key={m.id} className="border-border bg-surface rounded-sm border p-6">
                <StreamingText text={m.text} loading={loading && i === messages.length - 1} />
              </div>
            )
          )}
          <div ref={endRef} />
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      <div className="mt-4">
        <Textarea
          label="Question"
          placeholder="Why is my Rampage uptime below theirs?"
          value={draft}
          disabled={loading}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Entrée envoie, Maj+Entrée passe à la ligne : la convention de tous les chats, et
            // la seule qui ne fasse pas chercher le bouton à chaque question.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (draft.trim()) submit(draft.trim());
            }
          }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          size="md"
          disabled={loading || !draft.trim() || !canSend}
          onClick={() => submit(draft.trim())}
        >
          {loading ? 'Thinking…' : 'Ask'}
        </Button>
        {messages.length > 0 && (
          <Button variant="secondary" size="md" onClick={reset} disabled={loading}>
            Reset
          </Button>
        )}
        {usage && !loading && (
          <span className="text-dim font-mono text-xs">
            {usage.totalTokens.toLocaleString()} tokens
          </span>
        )}
      </div>
    </div>
  );
}
