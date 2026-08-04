export type StepStatus = 'pending' | 'loading' | 'done' | 'error';

export interface Step {
  label: string;
  status: StepStatus;
}

const STATUS_COLOR: Record<StepStatus, string> = {
  done: 'text-brass',
  error: 'text-danger',
  loading: 'text-text',
  pending: 'text-dim',
};

export function ProgressSteps({ steps }: { steps: Step[] }) {
  return (
    <div className="flex flex-col gap-1">
      {steps.map((step) => (
        <div
          key={step.label}
          className={`flex items-center gap-2 font-mono text-xs ${STATUS_COLOR[step.status]}`}
        >
          <span className="inline-block w-3.5 text-center">
            {step.status === 'done'
              ? '✓'
              : step.status === 'error'
                ? '✗'
                : step.status === 'loading'
                  ? '…'
                  : '·'}
          </span>
          {step.label}
        </div>
      ))}
    </div>
  );
}
