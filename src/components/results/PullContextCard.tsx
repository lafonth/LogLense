import type { FightContext } from '@/lib/wcl/fight-context';
import { Card } from '@/components/ui/Card';

interface PullContextCardProps {
  before: { label: string; context: FightContext | null; fightMs: number };
  after: { label: string; context: FightContext | null; fightMs: number };
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function ContextColumn({
  label,
  context,
  fightMs,
}: {
  label: string;
  context: FightContext | null;
  fightMs: number;
}) {
  return (
    <div>
      <h4 className="text-2xs tracking-caps text-dim mb-2 font-sans uppercase">{label}</h4>
      <ul className="font-sans text-xs">
        <li className="flex justify-between gap-3">
          <span className="text-muted">kill time</span>
          <span className="text-text font-mono">{formatDuration(fightMs)}</span>
        </li>
        {context === null ? (
          <li className="text-muted mt-1">context unavailable</li>
        ) : (
          <>
            <li className="flex justify-between gap-3">
              <span className="text-muted">raid deaths</span>
              <span className="text-text font-mono">{context.deaths}</span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-muted">you died</span>
              <span
                className={context.subjectDied ? 'text-danger font-mono' : 'text-text font-mono'}
              >
                {context.subjectDied ? formatDuration(context.subjectDeathMs ?? fightMs) : 'no'}
              </span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-muted">wipes before</span>
              <span className="text-text font-mono">
                {context.wipesBefore === null ? 'unknown' : context.wipesBefore}
              </span>
            </li>
          </>
        )}
      </ul>
    </div>
  );
}

/**
 * Le contexte de raid des deux pulls, affiché et pas seulement pris en compte dans le
 * calcul (spec 04 §3) : un mort du sujet ou un raid qui vient d'enchaîner des wipes change
 * la lecture du delta de DPS sans que la décomposition ne puisse le voir.
 */
export function PullContextCard({ before, after }: PullContextCardProps) {
  return (
    <Card header="Raid context">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ContextColumn {...before} />
        <ContextColumn {...after} />
      </div>
    </Card>
  );
}
