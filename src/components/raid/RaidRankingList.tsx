'use client';

import type { RaidRanking, RankedRaider } from '@/lib/wcl/raid-ranking';

const ROW_CLASS =
  'bg-surface border-border hover:border-brass focus-visible:outline-brass-bright focus-visible:outline-2 focus-visible:outline-offset-2 grid w-full cursor-pointer grid-cols-[2rem_1fr_auto] items-center gap-4 rounded-sm border px-4 py-3 text-left transition-colors';

function formatDps(dps: number): string {
  return `${(dps / 1000).toFixed(1)}k`;
}

interface RaidRankingListProps {
  ranking: RaidRanking;
  onOpen: (player: RankedRaider) => void;
}

/**
 * Le raid trié par marge de progression, le plus de marge en haut.
 *
 * L'axe du tri est écrit en clair au-dessus de la liste, toujours : un classement dont on
 * ignore l'axe ne se lit pas. Le percentile et le DPS brut n'ordonnent pas la même chose, et
 * le second ne se présente jamais comme une version approchée du premier.
 */
export function RaidRankingList({ ranking, onOpen }: RaidRankingListProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="text-text font-mono text-sm tracking-wider uppercase">
          {ranking.encounterName}
        </div>
        <div className="text-dim text-2xs font-mono">
          {ranking.kill ? 'Kill' : 'Wipe'} —{' '}
          <span className="font-mono">{ranking.players.length}</span> player(s) ranked
        </div>
      </div>

      <p className="text-muted font-mono text-xs leading-relaxed">{ranking.criterionReason}</p>

      <div className="flex flex-col gap-2">
        {ranking.players.map((player, idx) => (
          <button
            key={player.actorId}
            type="button"
            onClick={() => onOpen(player)}
            className={ROW_CLASS}
          >
            <span className="text-dim font-mono text-xs">{idx + 1}</span>
            <span className="flex flex-col gap-1">
              <span className="text-text font-mono text-sm">{player.name}</span>
              <span className="text-dim text-2xs font-mono">
                {player.specName && player.className
                  ? `${player.specName} ${player.className}`
                  : (player.className ?? 'Unknown spec')}
                {player.tierPieces !== null && (
                  <>
                    {' — '}
                    <span className="font-mono">{player.tierPieces}</span>p tier
                  </>
                )}
              </span>
            </span>
            <span className="flex flex-col items-end gap-1">
              {ranking.criterion === 'percentile' ? (
                <>
                  <span className="text-deviation font-mono text-sm">{player.percentile}</span>
                  <span className="text-dim text-2xs font-mono">{formatDps(player.dps)} dps</span>
                </>
              ) : (
                <>
                  <span className="text-deviation font-mono text-sm">{formatDps(player.dps)}</span>
                  <span className="text-dim text-2xs font-mono">
                    {player.percentile === null ? (
                      'no percentile'
                    ) : (
                      <>
                        <span className="font-mono">{player.percentile}</span> pct
                      </>
                    )}
                  </span>
                </>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
