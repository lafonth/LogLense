'use client';

import type { PromptAxis } from '@/lib/ai/prompt';
import type { ReportVerdict } from '@/lib/labels/report';
import type { BossResult } from '@/types';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { PROMPT_AXES } from '@/lib/ai/prompt';

/**
 * Le retour du lecteur sur le rapport IA.
 *
 * Deux boutons et une liste d'axes, **aucun champ libre** : dans un corpus en écriture seule,
 * un « dites-nous pourquoi » ouvre un canal de données personnelles qu'aucun plafond de
 * longueur ne referme, et le §5c des CGU s'applique dès qu'un tiers y est nommé.
 *
 * Le vocabulaire des axes est celui du prompt : c'est ce qui permet de confronter ce qui a
 * été conseillé à ce que le lecteur a jugé sans valeur.
 */
const AXIS_LABELS: Record<PromptAxis, string> = {
  stats: 'DPS & stats',
  'spell-usage': 'Spell usage',
  opening: 'Opening',
  uptimes: 'Cooldowns',
  damage: 'Damage split',
  talents: 'Talents',
};

type Status = 'idle' | 'choosing' | 'sending' | 'done' | 'error';

interface ReportFeedbackProps {
  boss: BossResult;
}

export function ReportFeedback({ boss }: ReportFeedbackProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [selected, setSelected] = useState<PromptAxis[]>([]);

  function toggle(axis: PromptAxis) {
    setSelected((s) => (s.includes(axis) ? s.filter((a) => a !== axis) : [...s, axis]));
  }

  async function submit(verdict: ReportVerdict, uselessAxes: PromptAxis[]) {
    setStatus('sending');
    try {
      const res = await fetch('/api/labels/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Posé par le serveur sur ce rendu : c'est ce qui rattache ce jugement au conseil
          // qui l'a provoqué, et à l'exposition qui l'a précédé.
          renderId: boss.renderId,
          verdict,
          uselessAxes,
          encounterId: boss.encounterId,
          difficulty: boss.difficulty,
          specId: boss.specId,
        }),
      });
      setStatus(res.ok ? 'done' : 'error');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'done') {
    return <p className="text-muted mt-3 font-mono text-xs">Thanks — recorded.</p>;
  }

  return (
    <div className="border-border bg-surface mt-3 rounded-sm border px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-dim font-mono text-xs">Did this help?</span>
        <Button
          variant="ghost"
          size="xs"
          disabled={status === 'sending'}
          onClick={() => submit('useful', selected)}
        >
          Useful
        </Button>
        <Button
          variant="ghost"
          size="xs"
          disabled={status === 'sending'}
          onClick={() => submit('useless', selected)}
        >
          Not useful
        </Button>
        {status === 'idle' && (
          <Button variant="ghost" size="xs" onClick={() => setStatus('choosing')}>
            Flag a section
          </Button>
        )}
        {status === 'sending' && <span className="text-dim text-2xs">Saving…</span>}
      </div>

      {(status === 'choosing' || status === 'error') && (
        <>
          <p className="text-dim text-2xs mt-2">Which sections told you nothing?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PROMPT_AXES.map((axis) => (
              <Button
                key={axis}
                variant={selected.includes(axis) ? 'primary' : 'secondary'}
                size="xs"
                onClick={() => toggle(axis)}
              >
                {AXIS_LABELS[axis]}
              </Button>
            ))}
          </div>
        </>
      )}

      {status === 'error' && (
        <p className="text-danger text-2xs mt-2">That feedback could not be saved. Try again.</p>
      )}
    </div>
  );
}
