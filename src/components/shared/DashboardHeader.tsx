import type { StepStatus } from '@/components/ui/ProgressSteps';
import type { BossState } from '@/hooks/useAnalysis';
import type { AnalysisInput } from '@/types';
import { Button } from '@/components/ui/Button';
import { ProgressSteps } from '@/components/ui/ProgressSteps';

const DIFFICULTIES = [
  { id: 5, label: 'Mythic' },
  { id: 4, label: 'Heroic' },
  { id: 3, label: 'Normal' },
] as const;

interface DashboardHeaderProps {
  title: string;
  subtitle: string;
  difficulty: number;
  availableDifficulties?: Set<number>;
  onDifficultyChange: (diff: AnalysisInput['difficulty']) => void;
  onReset: () => void;
}

export function DashboardHeader({
  title,
  subtitle,
  difficulty,
  availableDifficulties,
  onDifficultyChange,
  onReset,
}: DashboardHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-brass m-0 text-2xl">{title}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span className="text-muted font-mono text-xs">{subtitle}</span>
          <span className="text-border">·</span>
          {DIFFICULTIES.map(({ id, label }) => {
            const available = availableDifficulties ? availableDifficulties.has(id) : true;
            const active = difficulty === id;
            if (!available) {
              return (
                <span
                  key={id}
                  title="No kills at this difficulty"
                  className="border-border text-muted text-2xs rounded-full border px-2 py-1 font-mono tracking-[0.04em] opacity-30"
                >
                  {label}
                </span>
              );
            }
            return (
              <Button
                key={id}
                variant="secondary"
                size="sm"
                onClick={() => !active && onDifficultyChange(id)}
                className={`text-2xs rounded-full px-2 py-1 font-mono tracking-[0.04em] ${
                  active ? 'border-brass/40 bg-brass/10 text-brass' : 'text-muted'
                }`}
              >
                {label}
              </Button>
            );
          })}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Button variant="secondary" size="sm" onClick={onReset} className="font-mono text-xs">
          ← New search
        </Button>
        {/* Reserves room for the fixed-position AuthHeader widget in the top-right corner. */}
        <div aria-hidden="true" className="hidden w-44 sm:block" />
      </div>
    </div>
  );
}

interface LoadingProgressProps {
  encounters: { name: string }[];
  bossStates: BossState[];
}

export function LoadingProgress({ encounters, bossStates }: LoadingProgressProps) {
  const isLoading = bossStates.some((s) => s.status === 'loading' || s.status === 'idle');
  if (!isLoading) return null;

  return (
    <div className="border-border bg-surface mb-6 rounded-sm border p-4">
      <div className="text-2xs text-muted mb-2 font-mono tracking-[0.08em] uppercase">
        Fetching bosses…
      </div>
      <ProgressSteps
        steps={encounters.map((enc, i) => {
          const s = bossStates[i];
          const status: StepStatus =
            s?.status === 'success'
              ? 'done'
              : s?.status === 'error'
                ? 'error'
                : s?.status === 'loading'
                  ? 'loading'
                  : 'pending';
          return { label: enc.name, status };
        })}
      />
    </div>
  );
}
