import type { TalentDiffEntry, TalentSource } from '@/lib/comparison/talent-diff';
import type { TalentNode } from '@/types';
import { Card } from '@/components/ui/Card';
import { diffTalents } from '@/lib/comparison/talent-diff';

interface TalentDiffProps {
  nodes: TalentNode[];
  myTalents: Record<number, number>;
  /** Toute la fenêtre comparable, pas les trois références chères : l'adoption d'un talent
   * se lit sur un effectif, et douze en disent plus que trois pour le même prix. */
  references: TalentSource[];
}

/**
 * Au-delà de cette part de références, un nœud cesse d'être une information.
 *
 * Le seuil est le même des deux côtés, mais il ne coupe pas dans le même sens : à droite, un
 * talent pris par deux références sur onze est du bruit ; à gauche, c'est au contraire un
 * talent que *presque tout le monde partage avec moi* qui n'apprend rien — la divergence y
 * est marginale. Dans les deux colonnes, le bloc replié est donc la queue du tri.
 */
const CONSENSUS = 2 / 3;

function isMarginal(entry: TalentDiffEntry, accent: 'mine' | 'theirs'): boolean {
  if (entry.referenceTotal === 0) return false;
  const share = entry.referenceCount / entry.referenceTotal;
  return accent === 'mine' ? share >= CONSENSUS : share < CONSENSUS;
}

function EntryRow({ entry, accent }: { entry: TalentDiffEntry; accent: 'mine' | 'theirs' }) {
  const share = entry.referenceTotal > 0 ? entry.referenceCount / entry.referenceTotal : 0;
  return (
    <li
      className={`bg-surface-raised flex items-baseline justify-between gap-3 rounded-xs border-l-2 px-3 py-2 ${
        accent === 'mine' ? 'border-deviation' : 'border-brass'
      }`}
    >
      <span className="text-text font-sans text-xs">{entry.label}</span>
      <span className="flex shrink-0 items-center gap-2">
        {entry.referenceTotal > 0 && (
          <span className="bg-border h-1 w-12 overflow-hidden rounded-xs" aria-hidden="true">
            {/* Géométrie calculée à l'exécution — l'exception `style` admise par CLAUDE.md,
                comme dans DamageBreakdown et RotationCards. */}
            <span
              className={`block h-full ${accent === 'mine' ? 'bg-deviation' : 'bg-brass'}`}
              style={{ width: `${share * 100}%` }}
            />
          </span>
        )}
        <span className="text-2xs text-muted font-mono">
          {entry.referenceTotal > 0 ? `${entry.referenceCount} / ${entry.referenceTotal}` : '—'}
        </span>
      </span>
    </li>
  );
}

/** Une colonne : le bloc qui porte le signal ouvert, sa queue derrière un `<details>`. */
function DiffColumn({
  title,
  entries,
  accent,
}: {
  title: string;
  entries: TalentDiffEntry[];
  accent: 'mine' | 'theirs';
}) {
  const signal = entries.filter((e) => !isMarginal(e, accent));
  const marginal = entries.filter((e) => isMarginal(e, accent));

  return (
    <div>
      <h4
        className={`text-2xs tracking-caps mb-2 font-sans uppercase ${
          accent === 'mine' ? 'text-deviation' : 'text-brass'
        }`}
      >
        {title} · <span className="font-mono">{entries.length}</span>
      </h4>
      {signal.length > 0 && (
        <ul className="flex flex-col gap-1">
          {signal.map((entry) => (
            <EntryRow key={entry.nodeId} entry={entry} accent={accent} />
          ))}
        </ul>
      )}
      {marginal.length > 0 && (
        <details className={signal.length > 0 ? 'mt-2' : ''}>
          <summary className="text-2xs text-dim cursor-pointer font-sans">
            <span className="font-mono">{marginal.length}</span> marginal node
            {marginal.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-1 flex flex-col gap-1">
            {marginal.map((entry) => (
              <EntryRow key={entry.nodeId} entry={entry} accent={accent} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function TalentDiff({ nodes, myTalents, references }: TalentDiffProps) {
  const { mineOnly, theirsOnly, sharedCount, referenceTotal } = diffTalents(
    nodes,
    myTalents,
    references
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
        {showMine && <DiffColumn title="You only" entries={mineOnly} accent="mine" />}
        {showTheirs && <DiffColumn title="References only" entries={theirsOnly} accent="theirs" />}
      </div>
      <p className="border-border text-2xs text-dim mt-4 border-t pt-3 font-sans">
        <span className="font-mono">{sharedCount}</span> identical node
        {sharedCount === 1 ? '' : 's'} — hidden
      </p>
    </Card>
  );
}
