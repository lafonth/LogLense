import type { IconIndex } from '@/lib/wcl/icons';
import type { DamageEntry } from '@/types';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { SpellIcon } from '@/components/ui/SpellIcon';

interface DamageBreakdownProps {
  entries: DamageEntry[];
  /** L'index du combat. Absent, chaque ligne rend sa pastille neutre. */
  icons?: IconIndex;
}

export function DamageBreakdown({ entries, icons }: DamageBreakdownProps) {
  const total = entries.reduce((sum, e) => sum + e.total, 0);
  const top10 = entries
    .slice()
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return (
    <ScrollArea label="Damage breakdown" className="mt-4">
      {top10.map((entry) => {
        const pct = total > 0 ? (entry.total / total) * 100 : 0;
        return (
          <div key={entry.name} className="mb-2">
            <div className="mb-1 flex justify-between font-mono text-xs">
              <span className="text-muted flex min-w-0 items-center gap-1.5">
                <SpellIcon name={entry.name} icon={icons?.[entry.name]} />
                <span className="truncate">{entry.name}</span>
              </span>
              <span className="text-text">{pct.toFixed(1)}%</span>
            </div>
            <div className="bg-border h-1 rounded-xs" aria-hidden="true">
              <div className="bg-brass h-full rounded-xs" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </ScrollArea>
  );
}
