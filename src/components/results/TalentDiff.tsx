import type { TalentDiffEntry } from '@/lib/comparison/talent-diff';
import type { TalentNode, TopPlayer } from '@/types';
import { Card } from '@/components/ui/Card';
import { diffTalents } from '@/lib/comparison/talent-diff';

interface TalentDiffProps {
  nodes: TalentNode[];
  myTalents: Record<number, number>;
  topPlayers: TopPlayer[];
}

function EntryRow({ entry, accent }: { entry: TalentDiffEntry; accent: 'mine' | 'theirs' }) {
  return (
    <li
      className={`bg-surface-raised flex items-baseline justify-between gap-3 rounded-xs border-l-2 px-3 py-2 ${
        accent === 'mine' ? 'border-deviation' : 'border-brass'
      }`}
    >
      <span className="text-text font-sans text-xs">{entry.label}</span>
      <span className="text-2xs text-muted shrink-0 font-mono">
        {entry.referenceTotal > 0 ? `${entry.referenceCount} / ${entry.referenceTotal}` : '—'}
      </span>
    </li>
  );
}

export function TalentDiff({ nodes, myTalents, topPlayers }: TalentDiffProps) {
  const { mineOnly, theirsOnly, sharedCount, referenceTotal } = diffTalents(
    nodes,
    myTalents,
    topPlayers
  );

  if (referenceTotal === 0) {
    return (
      <Card header="Build">
        <p className="text-muted font-sans text-xs">
          No comparable logs — showing your talents only.
        </p>
        <ul className="mt-3 flex flex-col gap-1">
          {mineOnly.map((entry) => (
            <EntryRow key={entry.nodeId} entry={entry} accent="mine" />
          ))}
        </ul>
      </Card>
    );
  }

  if (mineOnly.length === 0 && theirsOnly.length === 0) {
    return (
      <Card header="Build differences">
        <p className="text-muted font-sans text-xs">
          Identical build — every one of the <span className="font-mono">{sharedCount}</span> nodes
          matches the references.
        </p>
      </Card>
    );
  }

  const showMine = mineOnly.length > 0;
  const showTheirs = theirsOnly.length > 0;

  return (
    <Card
      header={
        <>
          Build differences · <span className="font-mono">{referenceTotal}</span> references
        </>
      }
    >
      <div className={showMine && showTheirs ? 'grid grid-cols-1 gap-6 md:grid-cols-2' : ''}>
        {showMine && (
          <div>
            <h4 className="text-2xs text-deviation mb-2 font-sans tracking-[0.12em] uppercase">
              You only · <span className="font-mono">{mineOnly.length}</span>
            </h4>
            <ul className="flex flex-col gap-1">
              {mineOnly.map((entry) => (
                <EntryRow key={entry.nodeId} entry={entry} accent="mine" />
              ))}
            </ul>
          </div>
        )}
        {showTheirs && (
          <div>
            <h4 className="text-2xs text-brass mb-2 font-sans tracking-[0.12em] uppercase">
              References only · <span className="font-mono">{theirsOnly.length}</span>
            </h4>
            <ul className="flex flex-col gap-1">
              {theirsOnly.map((entry) => (
                <EntryRow key={entry.nodeId} entry={entry} accent="theirs" />
              ))}
            </ul>
          </div>
        )}
      </div>
      <p className="border-border text-2xs text-dim mt-4 border-t pt-3 font-sans">
        <span className="font-mono">{sharedCount}</span> identical node
        {sharedCount === 1 ? '' : 's'} — hidden
      </p>
    </Card>
  );
}
