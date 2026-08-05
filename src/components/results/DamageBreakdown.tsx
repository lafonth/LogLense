import type { DamageEntry } from '@/types';
import { ScrollArea } from '@/components/ui/ScrollArea';

interface DamageBreakdownProps {
  entries: DamageEntry[];
}

export function DamageBreakdown({ entries }: DamageBreakdownProps) {
  const total = entries.reduce((sum, e) => sum + e.total, 0);
  const top10 = entries
    .slice()
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return (
    <ScrollArea className="mt-4">
      {top10.map((entry) => {
        const pct = total > 0 ? (entry.total / total) * 100 : 0;
        return (
          <div key={entry.name} className="mb-2">
            <div className="mb-1 flex justify-between font-mono text-xs">
              <span className="text-muted">{entry.name}</span>
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
