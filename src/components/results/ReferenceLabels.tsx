'use client';

import type { LabelReason } from '@/lib/labels/schema';
import type { BossResult } from '@/types';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LABEL_REASONS } from '@/lib/labels/schema';

const REASON_LABELS: Record<LabelReason, string> = {
  externals: 'Externals',
  'set-bonus': 'Set bonus',
  'kill-time': 'Kill time',
  ilvl: 'Item level',
  other: 'Other',
};

type Status = 'idle' | 'choosing' | 'sending' | 'done' | 'error';

interface ReferenceLabelsProps {
  result: BossResult;
}

export function ReferenceLabels({ result }: ReferenceLabelsProps) {
  const [status, setStatus] = useState<Record<number, Status>>({});

  const { character, comparability } = result;

  async function submit(rank: number, reason: LabelReason) {
    const { provenance } = result.topPlayers[rank - 1];

    setStatus((s) => ({ ...s, [rank]: 'sending' }));

    const body = {
      reason,
      encounterId: result.encounterId,
      difficulty: result.difficulty,
      specId: result.specId,
      subject: {
        ...character.source,
        ilvl: comparability.myIlvl,
        killTimeMs: comparability.myKillTimeMs,
      },
      reference: {
        code: provenance.code,
        fightID: provenance.fightID,
        name: provenance.name,
        ilvl: provenance.ilvl,
        killTimeMs: provenance.killTimeMs,
        dps: provenance.dps,
      },
      scores: {
        distance: provenance.distance,
        // Signed, reference − subject: being better geared than your references is not
        // the same situation as the reverse, and an absolute value loses that.
        ilvlGap: provenance.ilvl === null ? null : provenance.ilvl - comparability.myIlvl,
        killTimeGapPct:
          comparability.myKillTimeMs === 0
            ? 0
            : ((provenance.killTimeMs - comparability.myKillTimeMs) / comparability.myKillTimeMs) *
              100,
        rank,
      },
      pool: {
        candidatesConsidered: comparability.candidatesConsidered,
        pagesFetched: comparability.pagesFetched,
        level: comparability.level,
      },
    };

    try {
      const res = await fetch('/api/labels/comparability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setStatus((s) => ({ ...s, [rank]: res.ok ? 'done' : 'error' }));
    } catch {
      setStatus((s) => ({ ...s, [rank]: 'error' }));
    }
  }

  if (result.topPlayers.length === 0) return null;

  return (
    <Card header="Challenge a reference">
      <ul className="flex flex-col gap-3">
        {result.topPlayers.map((player, i) => {
          const rank = i + 1;
          const state = status[rank] ?? 'idle';

          return (
            <li key={`${player.provenance.code}:${player.provenance.fightID}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs">{player.provenance.name}</span>

                {state === 'idle' && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setStatus((s) => ({ ...s, [rank]: 'choosing' }))}
                  >
                    Not comparable
                  </Button>
                )}

                {state === 'sending' && <span className="text-dim text-2xs">Saving…</span>}
                {state === 'done' && <span className="text-muted text-2xs">Recorded</span>}
              </div>

              {(state === 'choosing' || state === 'error') && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {LABEL_REASONS.map((reason) => (
                    <Button
                      key={reason}
                      variant="secondary"
                      size="xs"
                      onClick={() => submit(rank, reason)}
                    >
                      {REASON_LABELS[reason]}
                    </Button>
                  ))}
                </div>
              )}

              {state === 'error' && (
                <p className="text-danger text-2xs mt-2">
                  That ruling could not be saved. Try again.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
