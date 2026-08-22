/* eslint-disable react/no-array-index-key --
 * L'arbre est reconstruit à chaque chunk par `parseMarkdown` : ses nœuds n'ont pas d'identité
 * propre, et rien n'y est inséré, retiré ni réordonné au milieu d'une liste. La position EST
 * la seule clé stable ici ; une clé dérivée du contenu ferait remonter le DOM à chaque lettre
 * ajoutée en fin de flux.
 */
import type { Align, InlineNode, LeafNode, MarkdownBlock } from '@/lib/ai/markdown';
import { Fragment } from 'react';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { parseMarkdown } from '@/lib/ai/markdown';

interface StreamingTextProps {
  text: string;
  loading: boolean;
}

const CELL = 'border-border font-mono text-xs border-b px-3 py-2';
const HEADER_CELL = `${CELL} text-muted text-2xs tracking-wider uppercase`;

// Première colonne à gauche, les suivantes à droite : ce sont des chiffres, et ils se lisent
// alignés sur l'unité. L'alignement écrit dans le markdown l'emporte quand il existe.
function alignOf(align: Align, index: number): string {
  if (align === 'center') return 'text-center';
  if (align === 'left') return 'text-left';
  if (align === 'right') return 'text-right';
  return index === 0 ? 'text-left' : 'text-right';
}

function Leaves({ nodes }: { nodes: LeafNode[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        if (node.type === 'num') {
          return (
            <span key={i} className="font-mono">
              {node.value}
            </span>
          );
        }
        if (node.type === 'code') {
          return (
            <code key={i} className="bg-surface-raised text-brass-bright rounded-xs px-1 font-mono">
              {node.value}
            </code>
          );
        }
        return <Fragment key={i}>{node.value}</Fragment>;
      })}
    </>
  );
}

function Inline({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        if (node.type === 'strong') {
          return (
            <strong key={i} className="text-text font-semibold">
              <Leaves nodes={node.children} />
            </strong>
          );
        }
        if (node.type === 'em') {
          return (
            <em key={i} className="italic">
              <Leaves nodes={node.children} />
            </em>
          );
        }
        return <Leaves key={i} nodes={[node]} />;
      })}
    </>
  );
}

function Cursor() {
  return (
    <span className="bg-brass ml-0.5 inline-block h-4 w-0.5 animate-pulse align-text-bottom" />
  );
}

const HEADING_CLASS: Record<1 | 2 | 3, string> = {
  1: 'text-text text-lg font-semibold',
  2: 'text-brass-bright text-base font-semibold',
  3: 'text-muted text-2xs tracking-wider uppercase',
};

function Block({ block, cursor }: { block: MarkdownBlock; cursor: boolean }) {
  switch (block.type) {
    case 'heading': {
      const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3';
      return (
        <Tag className={HEADING_CLASS[block.level]}>
          <Inline nodes={block.content} />
        </Tag>
      );
    }
    case 'rule':
      return <hr className="border-border border-t" />;
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag
          className={`marker:text-brass flex flex-col gap-1 pl-5 ${
            block.ordered ? 'list-decimal' : 'list-disc'
          }`}
        >
          {block.items.map((item, i) => (
            <li key={i}>
              <Inline nodes={item} />
            </li>
          ))}
        </Tag>
      );
    }
    case 'table':
      return (
        <ScrollArea label="Table from the report">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {block.header.map((cell, i) => (
                  <th key={i} className={`${HEADER_CELL} ${alignOf(block.align[i], i)}`}>
                    <Inline nodes={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      className={`${CELL} ${alignOf(block.align[c], c)} ${
                        c === 0 ? 'text-muted' : 'text-text'
                      }`}
                    >
                      <Inline nodes={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      );
    default:
      return (
        <p className="whitespace-pre-line">
          <Inline nodes={block.content} />
          {cursor && <Cursor />}
        </p>
      );
  }
}

/**
 * Le corps du rapport IA — la seule prose de l'application, donc la seule exception à la
 * règle du `font-mono` (CLAUDE.md). Les chiffres, eux, restent en `font-mono` jusque dans
 * une phrase : c'est `parseMarkdown` qui les isole.
 *
 * Le curseur se pose dans le dernier paragraphe quand il y en a un, pour que le texte
 * paraisse s'écrire ; après un tableau ou un titre, il se pose en dessous.
 */
export function StreamingText({ text, loading }: StreamingTextProps) {
  const blocks = parseMarkdown(text);
  const last = blocks[blocks.length - 1];
  const cursorInParagraph = loading && last?.type === 'paragraph';

  return (
    <div className="text-text flex min-h-30 max-w-[70ch] flex-col gap-3 font-sans text-sm leading-relaxed">
      {blocks.map((block, i) => (
        <Block key={i} block={block} cursor={cursorInParagraph && i === blocks.length - 1} />
      ))}
      {loading && !cursorInParagraph && <Cursor />}
    </div>
  );
}
