import type { BossState } from '@/hooks/useAnalysis';
import type { Encounter } from '@/types';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Sheet } from '@/components/ui/Sheet';

interface BossSidebarProps {
  encounters: Encounter[];
  bossStates: BossState[];
  activeIdx: number;
  onSelect: (idx: number) => void;
}

export function BossSidebar({ encounters, bossStates, activeIdx, onSelect }: BossSidebarProps) {
  const activeName = encounters[activeIdx]?.name ?? 'Bosses';

  return (
    <Sheet triggerLabel={activeName} title="Bosses">
      <div className="md:border-border w-full md:w-[200px] md:flex-shrink-0 md:border-r md:pr-4">
        {encounters.map((enc, i) => {
          const state = bossStates[i];
          const isActive = i === activeIdx;
          const pct =
            state?.status === 'success' && state.result ? state.result.character.overallPct : null;

          return (
            <button
              key={enc.id}
              type="button"
              onClick={() => onSelect(i)}
              aria-current={isActive ? true : undefined}
              className={`mb-1 flex w-full items-center justify-between rounded-sm border px-3 py-2 text-left ${
                isActive
                  ? 'border-brass-dim bg-surface-raised'
                  : 'border-transparent bg-transparent'
              }`}
            >
              <span className={`font-mono text-xs ${isActive ? 'text-brass' : 'text-muted'}`}>
                {enc.name}
              </span>
              {/* Huit boss se chargent de front : le libellé nomme lequel, sans encombrer
                  un rail large de 200 px. */}
              {state?.status === 'loading' && (
                <LoadingSpinner label={`Loading ${enc.name}…`} labelHidden />
              )}
              {state?.status === 'success' && pct !== null && <Badge pct={pct} size="sm" />}
              {/* `err` ne disait ni ce qui a échoué ni qu'on pouvait y revenir. Le rail n'a pas
                  la place du message — il porte l'état, la reprise est dans le panneau, à un
                  clic sur la ligne. */}
              {state?.status === 'error' && (
                <span className="text-danger text-2xs font-mono">failed</span>
              )}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
