export type StepStatus = 'pending' | 'loading' | 'done' | 'error';

export interface Step {
  label: string;
  status: StepStatus;
}

export function ProgressSteps({ steps }: { steps: Step[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {steps.map((step) => (
        <div
          key={step.label}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.82rem',
            color:
              step.status === 'done'
                ? 'var(--gold)'
                : step.status === 'error'
                  ? 'var(--crimson)'
                  : step.status === 'loading'
                    ? 'var(--text)'
                    : 'var(--text-dim)',
          }}
        >
          <span style={{ width: '14px', textAlign: 'center' }}>
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
