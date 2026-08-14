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
    <div className="border-border border-b py-4">
      {/* Row 1: DPS + kill time */}
      <div className="flex flex-wrap items-baseline gap-4">
        <span className="text-brass font-mono text-2xl font-semibold">
          {dps.toLocaleString('en-US')}
          <span className="text-muted ml-1 font-sans text-sm">dps</span>
        </span>
        {overallPct != null && <Badge pct={overallPct} size="lg" />}
        <span className="text-muted font-mono text-xs">{killTime}</span>
      </div>

      {/* Row 2: boss DPS + boss parse % */}
      {bossDps !== null && bossDpsPct !== null && (
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-muted font-sans text-xs">
            boss <span className="font-mono">{bossDps.toLocaleString('en-US')}</span> dps
          </span>
          <Badge pct={bossDpsPct} size="sm" />
        </div>
      )}

      {/* Row 3: ilvl */}
      <div className="mt-2">
        {/* Pas d'`opacity` ici : l'ilvl est un critère de comparabilité, pas un ornement, et
            un fondu à 0,6 sur `text-dim` retombait à 2,6:1 quelle que soit la teinte du token. */}
        <span className="text-dim font-sans text-xs">
          <span className="font-mono">{ilvl}</span> ilvl
        </span>
      </div>
    </div>
  );
}
