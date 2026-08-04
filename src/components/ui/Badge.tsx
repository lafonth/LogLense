interface BadgeProps {
  pct: number;
  size?: 'sm' | 'md' | 'lg';
}

function pctClass(pct: number): string {
  if (pct >= 99) return 'pct-legendary';
  if (pct >= 95) return 'pct-epic';
  if (pct >= 75) return 'pct-rare';
  if (pct >= 50) return 'pct-uncommon';
  return 'pct-common';
}

const SIZES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'text-2xs px-2 py-1',
  md: 'text-xs px-2 py-1',
  lg: 'text-base px-3 py-1',
};

export function Badge({ pct, size = 'md' }: BadgeProps) {
  return (
    <span
      className={`${pctClass(pct)} rounded-xs border border-current font-mono font-semibold ${SIZES[size]}`}
    >
      {pct}
    </span>
  );
}
