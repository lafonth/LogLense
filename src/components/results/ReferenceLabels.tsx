'use client';

import type { LabelReason } from '@/lib/labels/schema';
import type { DisqualificationReason } from '@/lib/wcl/eligibility';
import type { BossResult, ReferenceProvenance } from '@/types';
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

/** Ce qu'une référence substituée avait de plus que le joueur, dit en clair. */
const DISQUALIFIED_LABELS: Record<DisqualificationReason, string> = {
  'set-bonus': 'better set bonus',
  external: 'externals you did not have',
};

type Status = 'idle' | 'choosing' | 'sending' | 'done' | 'error';

interface ReferenceLabelsProps {
  result: BossResult;
}

/**
 * Identifie une référence, pas sa position.
 *
 * L'état est indexé là-dessus parce que le composant n'est pas remonté quand on change de
 * boss dans la barre latérale : seul `result` change. Indexé par rang, un « Recorded »
 * survivrait au changement et affirmerait une écriture qui n'a pas eu lieu — tout en
 * retirant le bouton qui permettait de la faire.
 */
function referenceKey(provenance: ReferenceProvenance): string {
  return `${provenance.code}:${provenance.fightID}`;
}

export function ReferenceLabels({ result }: ReferenceLabelsProps) {
  const [status, setStatus] = useState<Record<string, Status>>({});

  const { character, comparability } = result;

  async function submit(rank: number, reason: LabelReason) {
    const { provenance } = result.topPlayers[rank - 1];
    const key = referenceKey(provenance);

    setStatus((s) => ({ ...s, [key]: 'sending' }));

    const body = {
      // Celui que le serveur a posé sur ce rendu, jamais un identifiant fabriqué ici : c'est
      // la seule chose qui rattache ce refus à l'exposition qui l'a précédé.
      renderId: result.renderId,
      reason,
      encounterId: result.encounterId,
      difficulty: result.difficulty,
      specId: result.specId,
      // Pointeurs seuls des deux côtés. Les mesures — ilvl, kill time, set bonus, externals,
      // et le nom de la référence, que le §5c des CGU interdit — se réhydratent depuis WCL à
      // partir de `code` + `fightID` + `actorId`. Les recopier n'ajouterait rien qu'un risque.
      subject: { ...character.source },
      reference: {
        code: provenance.code,
        fightID: provenance.fightID,
        actorId: provenance.actorId,
        disqualifiedBy: provenance.disqualifiedBy,
      },
      scores: {
        // `Infinity` quand la sélection n'a pas pu scorer le candidat. Explicité en `null`
        // ici plutôt que laissé à `JSON.stringify`, qui le ferait silencieusement.
        distance: Number.isFinite(provenance.distance) ? provenance.distance : null,
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
    };

    try {
      const res = await fetch('/api/labels/comparability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setStatus((s) => ({ ...s, [key]: res.ok ? 'done' : 'error' }));
    } catch {
      setStatus((s) => ({ ...s, [key]: 'error' }));
    }
  }

  // La carte disparaissait sans un mot, et c'est celle qui demande le plus au lecteur : le
  // signalement d'une comparaison injuste est la seule donnée que le corpus ne peut pas
  // reconstituer seul. Un vide non expliqué se lit comme une carte cassée, pas comme une
  // sélection qui n'a rien gardé. Les chiffres de la recherche ne sont pas repris ici : le
  // bandeau juste au-dessus les porte déjà.
  if (result.topPlayers.length === 0) {
    return (
      <Card header="Challenge a reference">
        <p className="text-muted font-sans text-xs">
          Nothing to challenge: the selection kept no reference on this pull. This card lists the
          logs you were measured against so you can flag one as an unfair comparison — with no
          reference, there is no comparison to flag. The basis above says how the search ended.
        </p>
      </Card>
    );
  }

  return (
    <Card header="Challenge a reference">
      <ul className="flex flex-col gap-3">
        {result.topPlayers.map((player, i) => {
          const rank = i + 1;
          const key = referenceKey(player.provenance);
          const state = status[key] ?? 'idle';

          return (
            <li key={key}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs">{player.provenance.name}</span>

                {/*
                  Rouge, et non bleu : une substitution n'est pas un écart dans une
                  distribution, c'est une comparaison que la sélection a jugée illégitime et
                  qu'elle a gardée faute de mieux. C'est exactement ce à quoi `text-danger`
                  est réservé.
                */}
                {player.provenance.disqualifiedBy.length > 0 && (
                  <span className="text-danger text-2xs">
                    Kept without qualifying —{' '}
                    {player.provenance.disqualifiedBy.map((r) => DISQUALIFIED_LABELS[r]).join(', ')}
                  </span>
                )}

                {state === 'idle' && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setStatus((s) => ({ ...s, [key]: 'choosing' }))}
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
