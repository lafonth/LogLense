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

export function Badge({ pct, size = 'md' }: BadgeProps) {
  const sizeStyle =
    size === 'sm'
      ? { fontSize: '0.7rem', padding: '1px 5px' }
      : size === 'lg'
        ? { fontSize: '1.1rem', padding: '3px 10px' }
        : { fontSize: '0.85rem', padding: '2px 7px' };

  return (
    <span
      className={pctClass(pct)}
      style={{
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        border: '1px solid currentColor',
        borderRadius: '3px',
        ...sizeStyle,
      }}
    >
      {pct}
    </span>
  );
}
