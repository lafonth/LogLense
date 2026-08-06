import type { OpeningSource } from '@/lib/comparison/opening-diff';
import type { OpeningCast } from '@/types';
import { Card } from '@/components/ui/Card';
import { diffOpening } from '@/lib/comparison/opening-diff';

interface OpeningChainProps {
  mine: OpeningCast[];
  /** Les références dont la rotation a été payée — l'ordre des sorts n'existe que là. */
  references: OpeningSource[];
}

function offsetLabel(offsetMs: number): string {
  return `+${(offsetMs / 1000).toFixed(1)}s`;
}

export function OpeningChain({ mine, references }: OpeningChainProps) {
  const { steps, referenceTotal, firstDivergence } = diffOpening(mine, references);

  if (steps.length === 0) {
    return (
      <Card header="Opening">
        <p className="text-muted font-sans text-xs">
          No cast events available for this fight — the opening cannot be read.
        </p>
      </Card>
    );
  }

  return (
    <Card
      header={
        <>
          Opening · first <span className="font-mono">{steps.length}</span> casts
        </>
      }
    >
      {referenceTotal === 0 ? (
        <p className="text-muted mb-3 font-sans text-xs">
          No reference opening to compare against — showing your sequence only.
        </p>
      ) : (
        <p className="text-muted mb-3 font-sans text-xs">
          {firstDivergence === null ? (
            <>You follow the reference opening all the way through.</>
          ) : (
            <>
              You diverge from the references at cast{' '}
              <span className="text-deviation font-mono">{firstDivergence + 1}</span>.
            </>
          )}
        </p>
      )}

      <ol className="flex flex-col gap-1">
        {steps.map((step) => (
          <li
            key={step.index}
            className={`bg-surface-raised grid grid-cols-[2rem_1fr_1fr] items-baseline gap-3 rounded-xs border-l-2 px-3 py-2 ${
              step.matches || step.consensus === null ? 'border-border' : 'border-deviation'
            }`}
          >
            <span className="text-2xs text-dim font-mono">{step.index + 1}</span>
            <span className="text-text font-sans text-xs">
              {step.mine ?? <span className="text-dim">—</span>}
              {step.mine && mine[step.index] && (
                <span className="text-2xs text-dim ml-2 font-mono">
                  {offsetLabel(mine[step.index].offsetMs)}
                </span>
              )}
            </span>
            <span className="font-sans text-xs">
              {step.consensus === null ? (
                <span className="text-dim">—</span>
              ) : (
                <>
                  <span className={step.matches ? 'text-muted' : 'text-deviation'}>
                    {step.consensus}
                  </span>
                  <span className="text-2xs text-dim ml-2 font-mono">
                    {step.consensusCount} / {step.referenceTotal}
                  </span>
                </>
              )}
            </span>
          </li>
        ))}
      </ol>

      <p className="border-border text-2xs text-dim mt-4 border-t pt-3 font-sans">
        Left: your sequence, offset from your first cast. Right: what the{' '}
        <span className="font-mono">{referenceTotal}</span> reference
        {referenceTotal === 1 ? '' : 's'} cast at that rank.
      </p>
    </Card>
  );
}
