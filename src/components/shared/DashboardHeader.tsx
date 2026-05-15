import type { AnalysisInput } from '@/types';
import type { StepStatus } from '@/components/ui/ProgressSteps';
import type { BossState } from '@/hooks/useAnalysis';
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
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: '24px',
        paddingRight: '170px',
      }}
    >
      <div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.8rem',
            color: 'var(--gold)',
            margin: 0,
          }}
        >
          {title}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
              color: 'var(--text-dim)',
            }}
          >
            {subtitle}
          </span>
          <span style={{ color: 'var(--border)' }}>·</span>
          {DIFFICULTIES.map(({ id, label }) => {
            const available = availableDifficulties ? availableDifficulties.has(id) : true;
            const active = difficulty === id;
            if (!available) {
              return (
                <span
                  key={id}
                  title="No kills at this difficulty"
                  style={{
                    padding: '2px 10px',
                    borderRadius: '999px',
                    border: '1px solid var(--border)',
                    color: 'var(--text-dim)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.72rem',
                    letterSpacing: '0.04em',
                    opacity: 0.3,
                  }}
                >
                  {label}
                </span>
              );
            }
            return (
              <button
                key={id}
                onClick={() => !active && onDifficultyChange(id)}
                style={{
                  padding: '2px 10px',
                  borderRadius: '999px',
                  border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
                  background: active ? 'rgba(198,168,74,0.12)' : 'transparent',
                  color: active ? 'var(--gold)' : 'var(--text-dim)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                  letterSpacing: '0.04em',
                  cursor: active ? 'default' : 'pointer',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <button
        onClick={onReset}
        style={{
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          color: 'var(--text-dim)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.8rem',
          padding: '6px 14px',
          cursor: 'pointer',
        }}
      >
        ← New search
      </button>
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
    <div
      style={{
        marginBottom: '20px',
        padding: '14px 16px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '4px',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.72rem',
          color: 'var(--gold-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: '10px',
        }}
      >
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
