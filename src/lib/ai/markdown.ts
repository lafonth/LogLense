/**
 * Le sous-ensemble de markdown que les modèles produisent réellement dans un rapport :
 * titres, gras, italique, listes, tableaux, code en ligne, filets. Rien de plus.
 *
 * Pas de dépendance : une bibliothèque markdown complète apporte un parseur HTML, une
 * surface d'assainissement et un budget de bundle pour six constructions. Le parseur est ici
 * une fonction pure, testable sans rendu ; le composant ne fait que peindre l'arbre.
 *
 * Deux contraintes viennent du produit :
 * - Le texte arrive **en flux**. Un tableau dont la ligne de séparation n'est pas encore
 *   tombée n'est pas un tableau : il se rend en paragraphe, puis se corrige au chunk suivant.
 *   Aucune construction n'est donc jamais « en attente » — chaque état intermédiaire se rend.
 * - Les chiffres sont en `font-mono`, y compris au milieu d'une phrase (CLAUDE.md). C'est le
 *   parseur qui les isole en nœuds `num` : le composant n'a pas à découper du texte.
 */

export type Align = 'left' | 'center' | 'right' | null;

/** Ce qu'un nœud d'emphase peut contenir. L'emphase ne s'imbrique pas — inutile ici. */
export type LeafNode =
  | { type: 'text'; value: string }
  | { type: 'num'; value: string }
  | { type: 'code'; value: string };

export type InlineNode =
  | LeafNode
  | { type: 'strong'; children: LeafNode[] }
  | { type: 'em'; children: LeafNode[] };

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; content: InlineNode[] }
  | { type: 'paragraph'; content: InlineNode[] }
  | { type: 'list'; ordered: boolean; items: InlineNode[][] }
  | { type: 'table'; header: InlineNode[][]; align: Align[]; rows: InlineNode[][][] }
  | { type: 'rule' };

/**
 * Un nombre, avec ses groupes de milliers, sa décimale et son pourcentage éventuels —
 * « 1,234.5 », « 62 % » écrit « 62% », « p95 » dont seul le 95 est un nombre. La décimale
 * finale exige un chiffre derrière elle, sinon le point d'une fin de phrase serait avalé.
 */
const NUMBER_RE = /\d+(?:[.,]\d+)*%?/g;

/** `code`, **fort**, *emphase*. Le gras d'abord : `**` sinon se lit comme deux emphases. */
const INLINE_RE = /`([^`\n]+)`|\*\*([\s\S]+?)\*\*|\*([^*\n]+)\*/g;

const HEADING_RE = /^(#{1,6})[ \t]+(\S.*)?$/;
const RULE_RE = /^(?:-{3,}|\*{3,}|_{3,})$/;
/** Groupe 1 : le numéro d'une liste ordonnée, absent sur une puce. Groupe 2 : le contenu. */
const LIST_RE = /^[ \t]{0,3}(?:[-*+]|(\d{1,9})[.)])[ \t]+(\S.*)?$/;

/** Découpe un texte nu en alternance texte / nombre. */
function parseLeaves(src: string): LeafNode[] {
  if (!src) return [];
  const out: LeafNode[] = [];
  let last = 0;
  NUMBER_RE.lastIndex = 0;
  for (let m = NUMBER_RE.exec(src); m !== null; m = NUMBER_RE.exec(src)) {
    if (m.index > last) out.push({ type: 'text', value: src.slice(last, m.index) });
    out.push({ type: 'num', value: m[0] });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ type: 'text', value: src.slice(last) });
  return out;
}

export function parseInline(src: string): InlineNode[] {
  if (!src) return [];
  const out: InlineNode[] = [];
  let last = 0;
  INLINE_RE.lastIndex = 0;
  for (let m = INLINE_RE.exec(src); m !== null; m = INLINE_RE.exec(src)) {
    if (m.index > last) out.push(...parseLeaves(src.slice(last, m.index)));
    const [, code, strong, em] = m;
    if (code !== undefined) out.push({ type: 'code', value: code });
    else if (strong !== undefined) out.push({ type: 'strong', children: parseLeaves(strong) });
    else if (em !== undefined) out.push({ type: 'em', children: parseLeaves(em) });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push(...parseLeaves(src.slice(last)));
  return out;
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((c) => c.trim());
}

function isTableRow(line: string): boolean {
  return line.includes('|');
}

/** `|---|:--:|---:|` — la ligne qui fait d'un empilement de pipes un tableau. */
function parseSeparator(line: string): Align[] | null {
  if (!isTableRow(line)) return null;
  const cells = splitRow(line);
  if (cells.length === 0) return null;
  const align: Align[] = [];
  for (const cell of cells) {
    const m = /^(:?)-+(:?)$/.exec(cell);
    if (!m) return null;
    const left = m[1] === ':';
    const right = m[2] === ':';
    align.push(left && right ? 'center' : right ? 'right' : left ? 'left' : null);
  }
  return align;
}

/** Une ligne de tableau plus courte que son en-tête ne doit pas décaler les colonnes. */
function toCells(line: string, width: number): InlineNode[][] {
  const raw = splitRow(line);
  return Array.from({ length: width }, (_, i) => parseInline(raw[i] ?? ''));
}

export function parseMarkdown(src: string): MarkdownBlock[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];

  function flush() {
    if (paragraph.length === 0) return;
    blocks.push({ type: 'paragraph', content: parseInline(paragraph.join('\n')) });
    paragraph = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      flush();
      continue;
    }

    const heading = HEADING_RE.exec(trimmed);
    if (heading) {
      flush();
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      blocks.push({ type: 'heading', level, content: parseInline((heading[2] ?? '').trim()) });
      continue;
    }

    if (RULE_RE.test(trimmed)) {
      flush();
      blocks.push({ type: 'rule' });
      continue;
    }

    // Un tableau ne commence qu'une fois sa ligne de séparation lue : en flux, l'en-tête seul
    // reste un paragraphe le temps d'un chunk plutôt que de se rendre en tableau vide.
    if (isTableRow(trimmed)) {
      const align = i + 1 < lines.length ? parseSeparator(lines[i + 1]) : null;
      if (align) {
        flush();
        const width = Math.max(splitRow(trimmed).length, align.length);
        const header = toCells(trimmed, width);
        const rows: InlineNode[][][] = [];
        i += 2;
        for (; i < lines.length; i++) {
          const row = lines[i].trim();
          if (row === '' || !isTableRow(row)) break;
          rows.push(toCells(row, width));
        }
        i--;
        blocks.push({
          type: 'table',
          header,
          align: Array.from({ length: width }, (_, c) => align[c] ?? null),
          rows,
        });
        continue;
      }
    }

    const list = LIST_RE.exec(line);
    if (list) {
      flush();
      const ordered = list[1] !== undefined;
      const items: InlineNode[][] = [parseInline(list[2] ?? '')];
      for (i++; i < lines.length; i++) {
        const next = LIST_RE.exec(lines[i]);
        if (!next || (next[1] !== undefined) !== ordered) break;
        items.push(parseInline(next[2] ?? ''));
      }
      i--;
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    paragraph.push(trimmed);
  }

  flush();
  return blocks;
}
