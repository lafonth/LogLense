import type { TalentNode, TopPlayer } from '@/types';

interface TalentTreeProps {
  nodes: TalentNode[];
  myTalents: Record<number, number>;
  topPlayers: TopPlayer[];
}

const COL_SPACING = 48;
const ROW_SPACING = 48;
const NODE_R = 13;
const PAD = 20;

function nodeColor(
  talentIds: number[],
  mySet: Set<number>,
  topSets: Set<number>[]
): { fill: string; stroke: string; opacity: number } {
  const iHave = talentIds.some((id) => mySet.has(id));
  const topHave = talentIds.some((id) => topSets.some((s) => s.has(id)));

  if (!iHave && !topHave) return { fill: 'var(--bg)', stroke: 'var(--border)', opacity: 0.2 };
  if (iHave && topHave) return { fill: 'var(--surface)', stroke: 'var(--text-dim)', opacity: 1 };
  if (iHave) return { fill: 'rgba(198,168,74,0.18)', stroke: 'var(--gold)', opacity: 1 };
  return { fill: 'rgba(185,28,28,0.18)', stroke: 'var(--crimson)', opacity: 1 };
}

// Deduplicate nodes that share the same (row, col) — keep the one with a non-empty name.
// These occur when the Blizzard API returns spec-variant copies of the same tree position.
function dedupeByPosition(nodes: TalentNode[]): TalentNode[] {
  const seen = new Map<string, TalentNode>();
  for (const node of nodes) {
    const key = `${node.row}:${node.col}`;
    const existing = seen.get(key);
    if (!existing || (node.name && !existing.name)) {
      seen.set(key, node);
    }
  }
  return [...seen.values()];
}

const LEGEND = [
  { color: 'var(--gold)', label: 'You only' },
  { color: 'var(--crimson)', label: 'Top players only' },
  { color: 'var(--text-dim)', label: 'Both' },
];

export function TalentTree({ nodes, myTalents, topPlayers }: TalentTreeProps) {
  const mySet = new Set(Object.keys(myTalents).map(Number));
  const topSets = topPlayers.map((p) => new Set(Object.keys(p.stats.talents).map(Number)));

  const classNodes = dedupeByPosition(nodes.filter((n) => n.treeType === 'class'));
  const specNodes = dedupeByPosition(nodes.filter((n) => n.treeType === 'spec'));
  const dedupedNodes = [...classNodes, ...specNodes];

  const nodeById = new Map(dedupedNodes.map((n) => [n.id, n]));

  const maxClassRow = classNodes.reduce((m, n) => Math.max(m, n.row), 0);
  const specRowOffset = maxClassRow + 2;

  function toSvgX(col: number) {
    return PAD + col * COL_SPACING;
  }
  function toSvgY(row: number, treeType: 'class' | 'spec') {
    const effectiveRow = treeType === 'spec' ? row + specRowOffset : row;
    return PAD + effectiveRow * ROW_SPACING;
  }

  const maxCol = dedupedNodes.reduce((m, n) => Math.max(m, n.col), 0);
  const maxSpecRow = specNodes.reduce((m, n) => Math.max(m, n.row), 0);
  const maxRow = maxSpecRow + specRowOffset;

  const svgWidth = PAD * 2 + maxCol * COL_SPACING + NODE_R;
  const svgHeight = PAD * 2 + maxRow * ROW_SPACING + NODE_R + 16;

  const sectionLabelY = {
    class: PAD - 6,
    spec: PAD + specRowOffset * ROW_SPACING - 6,
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg
        width={svgWidth}
        height={svgHeight}
        style={{ display: 'block', maxWidth: '100%' }}
        role="img"
        aria-label="Feral Druid talent tree comparison"
      >
        {(['class', 'spec'] as const).map((section) => (
          <text
            key={section}
            x={PAD}
            y={sectionLabelY[section]}
            style={{
              fill: 'var(--gold-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            {section === 'class' ? 'Class Tree' : 'Spec Tree'}
          </text>
        ))}

        {/* Edges */}
        {dedupedNodes.map((node) =>
          node.children.map((childId) => {
            const child = nodeById.get(childId);
            if (!child) return null;
            return (
              <line
                key={`${node.id}-${childId}`}
                x1={toSvgX(node.col)}
                y1={toSvgY(node.row, node.treeType)}
                x2={toSvgX(child.col)}
                y2={toSvgY(child.row, child.treeType)}
                stroke="var(--border)"
                strokeWidth={1}
                opacity={0.4}
              />
            );
          })
        )}

        {/* Nodes — labels only on hover via <title> */}
        {dedupedNodes.map((node) => {
          const cx = toSvgX(node.col);
          const cy = toSvgY(node.row, node.treeType);
          const { fill, stroke, opacity } = nodeColor(node.talentIds, mySet, topSets);
          const isChoice = node.nodeType === 'choice';
          const strokeWidth = stroke === 'var(--text-dim)' ? 1 : 2;

          return (
            <g key={node.id} opacity={opacity} style={{ cursor: 'default' }}>
              <title>
                {node.names.filter(Boolean).join(' / ') || '—'}
                {node.maxRanks > 1 ? ` (${node.maxRanks} ranks)` : ''}
              </title>
              {isChoice ? (
                <rect
                  x={cx - NODE_R}
                  y={cy - NODE_R}
                  width={NODE_R * 2}
                  height={NODE_R * 2}
                  rx={3}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                />
              ) : (
                <circle cx={cx} cy={cy} r={NODE_R} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
              )}
            </g>
          );
        })}
      </svg>

      <div
        style={{
          display: 'flex',
          gap: '16px',
          marginTop: '8px',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.72rem',
          color: 'var(--text-dim)',
        }}
      >
        {LEGEND.map(({ color, label }) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span
              style={{
                display: 'inline-block',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                border: `2px solid ${color}`,
              }}
            />
            {label}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: '0.68rem' }}>
          Hover a node to see its name
        </span>
      </div>
    </div>
  );
}
