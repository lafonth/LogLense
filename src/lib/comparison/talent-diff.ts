import type { TalentNode } from '@/types';

/**
 * Le minimum dont l'écart de build a besoin : les talents pris. Volontairement plus large
 * que `TopPlayer`, pour que la comparaison porte sur toute la fenêtre vérifiée
 * (`ReferenceSample`) et non sur les trois seules références dont les dégâts ont été payés.
 */
export interface TalentSource {
  stats: { talents: Record<number, number> };
}

export interface TalentDiffEntry {
  nodeId: number;
  label: string;
  myRank: number | null;
  referenceCount: number;
  referenceTotal: number;
}

export interface TalentDiffResult {
  mineOnly: TalentDiffEntry[];
  theirsOnly: TalentDiffEntry[];
  sharedCount: number;
  referenceTotal: number;
}

/**
 * Au-delà de cette part de références, un nœud cesse d'être une information.
 *
 * Le seuil est le même des deux côtés, mais il ne coupe pas dans le même sens : à droite, un
 * talent pris par deux références sur onze est du bruit ; à gauche, c'est au contraire un
 * talent que *presque tout le monde partage avec moi* qui n'apprend rien — la divergence y
 * est marginale. Dans les deux colonnes, le bloc replié est donc la queue du tri.
 */
export const CONSENSUS = 2 / 3;

/**
 * Ce nœud est-il de la queue de distribution — celle qu'on replie plutôt que d'en parler ?
 *
 * Le prédicat vit ici, dans le module pur, parce qu'il a deux appelants : `TalentDiff.tsx`,
 * qui s'en sert pour décider ce qu'il replie, et `findings.ts`, qui s'en sert pour décider
 * quels nœuds ont le droit de monter en constat. Deux copies finiraient par diverger, et
 * l'écran replierait un talent dont la liste de constats parle juste au-dessus.
 */
export function isMarginal(entry: TalentDiffEntry, accent: 'mine' | 'theirs'): boolean {
  if (entry.referenceTotal === 0) return false;
  const share = entry.referenceCount / entry.referenceTotal;
  return accent === 'mine' ? share >= CONSENSUS : share < CONSENSUS;
}

/**
 * Blizzard returns spec-variant copies at the same grid position — merge them into one node
 * so no talentIds are lost. Identity (id/name/names) is taken from a named node when one exists.
 */
function dedupeByPosition(nodes: TalentNode[]): TalentNode[] {
  const seen = new Map<string, TalentNode>();
  for (const node of nodes) {
    const key = `${node.treeType}:${node.row}:${node.col}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, { ...node, talentIds: [...node.talentIds] });
      continue;
    }

    const talentIds = [...new Set([...existing.talentIds, ...node.talentIds])];
    const preferNode = node.name && !existing.name;
    seen.set(key, {
      ...(preferNode ? node : existing),
      talentIds,
    });
  }
  return [...seen.values()];
}

/**
 * Label for one *specific* talentId within a node, not the node as a whole — a choice node's
 * two options are different talents and must be labelled differently when they diverge.
 * `names` is expected to align by index with `talentIds` when populated; falls back to the
 * node's own name, then the talent id itself.
 */
function labelForId(node: TalentNode, id: number): string {
  const idx = node.talentIds.indexOf(id);
  const specific = idx >= 0 ? node.names[idx] : undefined;
  return specific || node.name || `#${id}`;
}

/** The specific talentId a player took at this node, or null if they took none of them. */
function idTakenIn(node: TalentNode, talents: Record<number, number>): number | null {
  for (const id of node.talentIds) {
    if (talents[id] !== undefined) return id;
  }
  return null;
}

/** How many references took each specific talentId at this node. */
function countReferenceChoices(node: TalentNode, references: TalentSource[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const player of references) {
    const id = idTakenIn(node, player.stats.talents);
    if (id !== null) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** The most-taken talentId in a non-empty counts map, ties broken by first-seen id. */
function dominant(counts: Map<number, number>): [number, number] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
}

function makeEntry(
  node: TalentNode,
  id: number,
  myRank: number | null,
  referenceCount: number,
  referenceTotal: number
): TalentDiffEntry {
  return {
    nodeId: node.id,
    label: labelForId(node, id),
    myRank,
    referenceCount,
    referenceTotal,
  };
}

export function diffTalents(
  nodes: TalentNode[],
  myTalents: Record<number, number>,
  references: TalentSource[]
): TalentDiffResult {
  const referenceTotal = references.length;
  const mineOnly: TalentDiffEntry[] = [];
  const theirsOnly: TalentDiffEntry[] = [];
  let sharedCount = 0;

  for (const node of dedupeByPosition(nodes)) {
    const myId = idTakenIn(node, myTalents);
    const refIdCounts = countReferenceChoices(node, references);

    if (myId === null && refIdCounts.size === 0) continue;

    if (myId === null) {
      // I took nothing here; report the option the references favoured.
      const [dominantId, dominantCount] = dominant(refIdCounts);
      theirsOnly.push(makeEntry(node, dominantId, null, dominantCount, referenceTotal));
      continue;
    }

    if (refIdCounts.size === 0) {
      // No reference touched this node at all.
      mineOnly.push(makeEntry(node, myId, myTalents[myId], 0, referenceTotal));
      continue;
    }

    const matchCount = refIdCounts.get(myId) ?? 0;
    const mismatch = new Map([...refIdCounts].filter(([id]) => id !== myId));
    const mismatchTotal = [...mismatch.values()].reduce((sum, c) => sum + c, 0);

    if (mismatchTotal === 0) {
      // Every reference that touched this node took the exact same option I did.
      sharedCount += 1;
      continue;
    }

    // Choice divergence: I took one option, the references (or some of them) took another.
    // This is a real difference, not a match — surface both sides.
    mineOnly.push(makeEntry(node, myId, myTalents[myId], matchCount, referenceTotal));
    const [dominantMismatchId, dominantMismatchCount] = dominant(mismatch);
    theirsOnly.push(
      makeEntry(node, dominantMismatchId, null, dominantMismatchCount, referenceTotal)
    );
  }

  // Les deux colonnes se trient dans des sens opposés, et ce n'est pas une symétrie ratée :
  // chacune met en tête ce qui, chez elle, porte l'information. À gauche, un talent que
  // personne d'autre ne prend (`0 / n`) est l'écart à examiner ; à droite, c'est le talent que
  // tout le monde prend et que je n'ai pas.
  mineOnly.sort((a, b) => a.referenceCount - b.referenceCount);
  theirsOnly.sort((a, b) => b.referenceCount - a.referenceCount);

  return { mineOnly, theirsOnly, sharedCount, referenceTotal };
}
