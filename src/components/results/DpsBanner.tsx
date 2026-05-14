import { Badge } from '@/components/ui/Badge';

interface DpsBannerProps {
  dps: number;
  overallPct: number | null;
  killTime: string;
  bossDps: number | null;
  bossDpsPct: number | null;
}

export function DpsBanner({ dps, overallPct, killTime, bossDps, bossDpsPct }: DpsBannerProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: '20px',
        flexWrap: 'wrap',
        padding: '16px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '2rem',
          color: 'var(--gold)',
          fontWeight: 600,
        }}
      >
        {dps.toLocaleString('en-US')}
        <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginLeft: '4px' }}>dps</span>
      </span>
      {overallPct != null && <Badge pct={overallPct} size="lg" />}
      <span
        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-dim)' }}
      >
        {killTime}
      </span>
      {bossDps !== null && bossDpsPct !== null && (
        <span
          style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-dim)' }}
        >
          boss {bossDps.toLocaleString('en-US')} dps <Badge pct={bossDpsPct} size="sm" />
        </span>
      )}
    </div>
  );
}
