import { Badge } from '@/components/ui/Badge';

interface DpsBannerProps {
  dps: number;
  overallPct: number | null;
  ilvl: number;
  killTime: string;
  bossDps: number | null;
  bossDpsPct: number | null;
}

export function DpsBanner({
  dps,
  overallPct,
  ilvl,
  killTime,
  bossDps,
  bossDpsPct,
}: DpsBannerProps) {
  return (
    <div
      style={{
        padding: '16px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Row 1: DPS + kill time */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px', flexWrap: 'wrap' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '2rem',
            color: 'var(--gold)',
            fontWeight: 600,
          }}
        >
          {dps.toLocaleString('en-US')}
          <span style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginLeft: '4px' }}>
            dps
          </span>
        </span>
        {overallPct != null && <Badge pct={overallPct} size="lg" />}
        <span
          style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-dim)' }}
        >
          {killTime}
        </span>
      </div>

      {/* Row 2: boss DPS + boss parse % */}
      {bossDps !== null && bossDpsPct !== null && (
        <div style={{ marginTop: '6px', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.85rem',
              color: 'var(--text-dim)',
            }}
          >
            boss {bossDps.toLocaleString('en-US')} dps
          </span>
          <Badge pct={bossDpsPct} size="sm" />
        </div>
      )}

      {/* Row 3: ilvl */}
      <div style={{ marginTop: '6px' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.78rem',
            color: 'var(--text-dim)',
            opacity: 0.6,
          }}
        >
          {ilvl} ilvl
        </span>
      </div>
    </div>
  );
}
