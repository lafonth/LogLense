import type { TalentNode, TopPlayer } from '@/types';

interface TalentTreeProps {
  nodes: TalentNode[];
  myTalents: Record<number, number>;
  topPlayers: TopPlayer[];
}

const COL_SPACING = 56;
const ROW_SPACING = 52;
const NODE_R = 14;
const PAD = 24;

function nodeColor(
  talentIds: number[],
  mySet: Set<number>,
  topSets: Set<number>[]
): { fill: string; stroke: string; opacity: number } {
  const iHave = talentIds.some((id) => mySet.has(id));
  const topHave = talentIds.some((id) => topSets.some((s) => s.has(id)));

  if (!iHave && !topHave) return { fill: 'var(--bg)', stroke: 'var(--border)', opacity: 0.25 };
  if (iHave && topHave) return { fill: 'var(--surface)', stroke: 'var(--text-dim)', opacity: 1 };
  if (iHave) return { fill: 'rgba(198,168,74,0.15)', stroke: 'var(--gold)', opacity: 1 };
  return { fill: 'rgba(185,28,28,0.15)', stroke: 'var(--crimson)', opacity: 1 };
}

export function TalentTree({ nodes, myTalents, topPlayers }: TalentTreeProps) {
  const mySet = new Set(Object.keys(myTalents).map(Number));
  const topSets = topPlayers.map((p) => new Set(Object.keys(p.stats.talents).map(Number)));

  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const classNodes = nodes.filter((n) => n.treeType === 'class');
  const specNodes = nodes.filter((n) => n.treeType === 'spec');

  const maxClassRow = classNodes.reduce((m, n) => Math.max(m, n.row), 0);
  const specRowOffset = maxClassRow + 2;

  function toSvgX(col: number) {
    return PAD + col * COL_SPACING;
  }
  function toSvgY(row: number, treeType: 'class' | 'spec') {
    const effectiveRow = treeType === 'spec' ? row + specRowOffset : row;
    return PAD + effectiveRow * ROW_SPACING;
  }

  const maxCol = nodes.reduce((m, n) => Math.max(m, n.col), 0);
  const maxSpecRow = specNodes.reduce((m, n) => Math.max(m, n.row), 0);
  const maxRow = maxSpecRow + specRowOffset;

  const svgWidth = PAD * 2 + maxCol * COL_SPACING + NODE_R;
  const svgHeight = PAD * 2 + maxRow * ROW_SPACING + NODE_R + 20;

  const sectionLabelY = {
    class: PAD - 8,
    spec: PAD + specRowOffset * ROW_SPACING - 8,
  };

  const LEGEND = [
    { color: 'var(--gold)', label: 'You only' },
    { color: 'var(--crimson)', label: 'Top players only' },
    { color: 'var(--text-dim)', label: 'Both' },
  ];

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
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            {section === 'class' ? 'Class Tree' : 'Spec Tree'}
          </text>
        ))}

        {nodes.map((node) =>
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
                opacity={0.5}
              />
            );
          })
        )}

        {nodes.map((node) => {
          const cx = toSvgX(node.col);
          const cy = toSvgY(node.row, node.treeType);
          const { fill, stroke, opacity } = nodeColor(node.talentIds, mySet, topSets);
          const isChoice = node.nodeType === 'choice';
          const strokeWidth = stroke === 'var(--text-dim)' ? 1 : 2;
          const label = node.name.length > 12 ? `${node.name.slice(0, 11)}…` : node.name;

          return (
            <g key={node.id} opacity={opacity}>
              <title>
                {node.names.join(' / ')}
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
              <text
                x={cx}
                y={cy + NODE_R + 11}
                textAnchor="middle"
                style={{
                  fill: 'var(--text-dim)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                }}
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>

      <div
        style={{
          display: 'flex',
          gap: '16px',
          marginTop: '10px',
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
      </div>
    </div>
  );
}
