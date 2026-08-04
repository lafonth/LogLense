import type { ReactNode } from 'react';

type Tone = 'default' | 'deviation' | 'positive';

interface StatTileProps {
  label: string;
  value: ReactNode;
  tone?: Tone;
}

const TONES: Record<Tone, string> = {
  default: 'text-text',
  deviation: 'text-deviation',
  positive: 'text-positive',
};

export function StatTile({ label, value, tone = 'default' }: StatTileProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-2xs text-dim font-sans tracking-[0.1em] uppercase">{label}</span>
      <span className={`font-mono text-sm font-medium ${TONES[tone]}`}>{value}</span>
    </div>
  );
}
