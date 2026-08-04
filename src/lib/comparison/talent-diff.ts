import type { TalentNode, TopPlayer } from '@/types';

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

function labelOf(node: TalentNode): string {
  return node.names.filter(Boolean).join(' / ') || node.name || `#${node.id}`;
}

/** The rank a player has on this node, or null if they took none of its talent ids. */
function rankIn(node: TalentNode, talents: Record<number, number>): number | null {
  for (const id of node.talentIds) {
    const rank = talents[id];
    if (rank !== undefined) return rank;
  }
  return null;
}

export function diffTalents(
  nodes: TalentNode[],
  myTalents: Record<number, number>,
  topPlayers: TopPlayer[]
): TalentDiffResult {
  const referenceTotal = topPlayers.length;
  const mineOnly: TalentDiffEntry[] = [];
  const theirsOnly: TalentDiffEntry[] = [];
  let sharedCount = 0;

  for (const node of dedupeByPosition(nodes)) {
    const myRank = rankIn(node, myTalents);
    const referenceCount = topPlayers.filter((p) => rankIn(node, p.stats.talents) !== null).length;

    if (myRank === null && referenceCount === 0) continue;

    const entry: TalentDiffEntry = {
      nodeId: node.id,
      label: labelOf(node),
      myRank,
      referenceCount,
      referenceTotal,
    };

    if (myRank !== null && referenceCount === 0) mineOnly.push(entry);
    else if (myRank === null) theirsOnly.push(entry);
    else sharedCount += 1;
  }

  theirsOnly.sort((a, b) => b.referenceCount - a.referenceCount);

  return { mineOnly, theirsOnly, sharedCount, referenceTotal };
}
