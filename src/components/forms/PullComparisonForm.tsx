'use client';

import type { PullPointer } from '@/lib/wcl/pull-pipeline';
import type { ReportFight } from '@/types';
import { useState } from 'react';
import { BackLink } from '@/components/ui/BackLink';
import { Button } from '@/components/ui/Button';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useReportMeta } from '@/hooks/useReportMeta';
import { getDpsSpecsForClass } from '@/lib/specs';

const DIFFICULTY_NAMES: Record<number, string> = { 5: 'Mythic', 4: 'Heroic', 3: 'Normal' };

function fightLabel(fight: ReportFight): string {
  const difficulty = DIFFICULTY_NAMES[fight.difficulty] ?? `Difficulté ${fight.difficulty}`;
  const seconds = Math.round((fight.endTime - fight.startTime) / 1000);
  const duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return `${fight.name} — ${difficulty} — ${fight.kill ? 'Kill' : 'Wipe'} — ${duration}`;
}

interface ResolvedSide {
  pointer: PullPointer;
  wowClass: string;
}

interface PullComparisonFormProps {
  onSubmit: (before: PullPointer, after: PullPointer, specId: number) => void;
  loading: boolean;
  onBack: () => void;
  error?: string | null;
}

/**
 * Un côté de la comparaison : code de rapport, acteur, combat. Reproduit le picker de
 * `RaidForm` deux fois plutôt que de le factoriser à travers l'écran — les deux côtés ne
 * partagent ni leur état ni leur `useReportMeta`, seulement leur rendu. Remonte le pointeur
 * résolu au parent dès que code, acteur et combat tiennent ensemble ; redescend à `null` sinon.
 */
function PullSidePicker({
  label,
  onResolved,
}: {
  label: string;
  onResolved: (resolved: ResolvedSide | null) => void;
}) {
  const { meta, fetchedCode, loading, error, fetchMeta } = useReportMeta();
  const [code, setCode] = useState('');
  const [actorId, setActorId] = useState<number | ''>('');
  const [fightId, setFightId] = useState<number | ''>('');

  const fights = (meta?.fights ?? []).filter((f) => f.encounterID > 0);

  function handleLoadReport(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    setActorId('');
    setFightId('');
    onResolved(null);
    void fetchMeta(trimmed);
  }

  function resolve(nextActorId: number | '', nextFightId: number | '') {
    if (!meta || !fetchedCode || !nextActorId || !nextFightId) {
      onResolved(null);
      return;
    }
    const actor = meta.actors.find((a) => a.id === nextActorId);
    const fight = fights.find((f) => f.id === nextFightId);
    if (!actor || !fight) {
      onResolved(null);
      return;
    }
    onResolved({
      wowClass: actor.subType,
      pointer: {
        code: fetchedCode,
        fightId: fight.id,
        actorId: actor.id,
        name: actor.name,
        fightMs: fight.endTime - fight.startTime,
        encounterId: fight.encounterID,
        difficulty: fight.difficulty,
      },
    });
  }

  // La liste des pulls ne dépend pas du personnage : changer d'acteur après avoir choisi la
  // pull vidait une sélection qui restait valable, et laissait le côté non résolu sans que
  // rien ne le dise — le bouton d'envoi restait éteint pour un champ apparemment rempli.
  function handleActorChange(id: number) {
    setActorId(id);
    resolve(id, fightId);
  }

  function handleFightChange(id: number) {
    setFightId(id);
    resolve(actorId, id);
  }

  return (
    <div className="border-border flex flex-col gap-4 rounded-sm border p-4">
      <h2 className="text-2xs tracking-caps text-dim font-sans uppercase">{label}</h2>

      <form onSubmit={handleLoadReport} className="flex flex-col gap-3">
        <Input
          label="WarcraftLogs Report Code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. aBcDeFgH12345678"
          disabled={loading}
        />
        {error && <ErrorBanner message={error} />}
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={loading || !code.trim()}
          className="w-fit tracking-wider uppercase"
        >
          {loading ? 'Loading…' : 'Load Report'}
        </Button>
      </form>

      {meta && fetchedCode === code.trim() && (
        <div className="flex flex-col gap-3">
          <div className="text-dim font-mono text-xs">{meta.title}</div>
          <Select
            label="Character"
            value={actorId}
            onChange={(e) => handleActorChange(Number(e.target.value))}
          >
            <option value="">— Choisir un personnage —</option>
            {[...meta.actors]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.subType})
                </option>
              ))}
          </Select>
          <Select
            label="Pull"
            value={fightId}
            onChange={(e) => handleFightChange(Number(e.target.value))}
            disabled={!actorId}
          >
            <option value="">— Choisir une pull —</option>
            {fights.map((f) => (
              <option key={f.id} value={f.id}>
                {fightLabel(f)}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  );
}

/**
 * Deux fois le picker « chemin rapport », sans classement ni référence : spec 04 ne compare
 * jamais qu'un joueur à lui-même. Le `specId` se déduit de la classe choisie côté « avant »,
 * comme le fallback de `RaidForm.handleOpen` — la première spec DPS de la classe, faute de
 * mieux, puisque WCL ne rend pas la spec d'un `actor` en dehors d'un classement.
 */
export function PullComparisonForm({ onSubmit, loading, onBack, error }: PullComparisonFormProps) {
  const [before, setBefore] = useState<ResolvedSide | null>(null);
  const [after, setAfter] = useState<ResolvedSide | null>(null);

  const specId = before ? getDpsSpecsForClass(before.wowClass)[0]?.specId : undefined;
  const ready = Boolean(before && after && specId);

  function handleSubmit() {
    if (!before || !after || !specId) return;
    onSubmit(before.pointer, after.pointer, specId);
  }

  return (
    <div className="flex h-full justify-center overflow-y-auto px-6 py-10">
      <div className="w-full max-w-[900px]">
        <BackLink onClick={onBack} />

        {/* La maquette ne prévoit pas de titre visible ici, mais l'écran en avait besoin d'un :
            sa hiérarchie commençait à « Before »/« After », deux `h3` sous aucun `h1`. Le titre
            existe donc pour le plan du document seulement, et les deux panneaux passent en `h2`. */}
        <h1 className="sr-only">Compare two pulls</h1>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <PullSidePicker label="Before" onResolved={setBefore} />
          <PullSidePicker label="After" onResolved={setAfter} />
        </div>

        {before && after && !specId && (
          <ErrorBanner message="No DPS spec found for this class — cannot compare." />
        )}
        {error && <ErrorBanner message={error} />}

        <Button
          type="button"
          variant="primary"
          size="md"
          disabled={!ready || loading}
          className="mt-6 w-fit tracking-wider uppercase"
          onClick={handleSubmit}
        >
          {loading ? 'Loading…' : 'Compare'}
        </Button>
      </div>
    </div>
  );
}
