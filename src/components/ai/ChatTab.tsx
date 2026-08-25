'use client';

import type { BossResult } from '@/types';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { useApiKey } from '@/hooks/useApiKey';
import { useChat } from '@/hooks/useChat';
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
  const [apiKey, setApiKey] = useApiKey('loglense_api_key');
  const [serverHasKey, setServerHasKey] = useState(false);
  const [draft, setDraft] = useState('');
  const { messages, usage, loading, error, send, reset } = useChat(boss?.snapshot, apiKey.trim());
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/ai-report')
      .then((r) => r.json())
      .then((d: { configuredProviders: string[] }) =>
        setServerHasKey(d.configuredProviders.includes('claude'))
      )
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

      {!serverHasKey && (
        <div className="mb-4">
          <Input
            type="password"
            label="Anthropic API Key — console.anthropic.com"
            placeholder="sk-ant-…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={loading}
          />
        </div>
      )}

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
