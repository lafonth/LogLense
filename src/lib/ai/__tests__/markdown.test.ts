import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from '@/lib/ai/markdown';

/** Le texte de tous les nœuds d'un bloc, emphase aplatie — pour asserter sans décrire l'arbre. */
function flatten(nodes: unknown): string {
  if (!Array.isArray(nodes)) return '';
  return nodes
    .map((n) => {
      const node = n as { type: string; value?: string; children?: unknown };
      if (node.type === 'strong' || node.type === 'em') return flatten(node.children);
      return node.value ?? '';
    })
    .join('');
}

describe('parseInline', () => {
  it('isole les nombres du texte qui les entoure', () => {
    expect(parseInline('You did 42 damage')).toEqual([
      { type: 'text', value: 'You did ' },
      { type: 'num', value: '42' },
      { type: 'text', value: ' damage' },
    ]);
  });

  it('garde les milliers, la décimale et le pourcentage dans un seul nombre', () => {
    expect(parseInline('1,234.5% up')).toEqual([
      { type: 'num', value: '1,234.5%' },
      { type: 'text', value: ' up' },
    ]);
  });

  it("n'avale pas le point d'une fin de phrase", () => {
    expect(parseInline('at 80.')).toEqual([
      { type: 'text', value: 'at ' },
      { type: 'num', value: '80' },
      { type: 'text', value: '.' },
    ]);
  });

  it('rend le gras, et les nombres qu’il contient restent des nombres', () => {
    expect(parseInline('**+12% dps**')).toEqual([
      {
        type: 'strong',
        children: [
          { type: 'text', value: '+' },
          { type: 'num', value: '12%' },
          { type: 'text', value: ' dps' },
        ],
      },
    ]);
  });

  it('distingue emphase et gras', () => {
    expect(parseInline('*a* and **b**')).toEqual([
      { type: 'em', children: [{ type: 'text', value: 'a' }] },
      { type: 'text', value: ' and ' },
      { type: 'strong', children: [{ type: 'text', value: 'b' }] },
    ]);
  });

  it('rend le code en ligne', () => {
    expect(parseInline('cast `Fireball` now')).toEqual([
      { type: 'text', value: 'cast ' },
      { type: 'code', value: 'Fireball' },
      { type: 'text', value: ' now' },
    ]);
  });

  it('laisse une étoile non fermée en texte brut', () => {
    expect(parseInline('**unfinished')).toEqual([{ type: 'text', value: '**unfinished' }]);
  });
});

describe('parseMarkdown — titres, listes, filets', () => {
  it('rend les trois niveaux de titre et écrase les plus profonds sur 3', () => {
    const blocks = parseMarkdown('# One\n## Two\n### Three\n##### Five');
    expect(blocks.map((b) => (b.type === 'heading' ? b.level : null))).toEqual([1, 2, 3, 3]);
    expect(flatten((blocks[0] as { content: unknown }).content)).toBe('One');
  });

  it('groupe les puces consécutives en une seule liste', () => {
    const blocks = parseMarkdown('- a\n- b\n- c');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('list');
    const list = blocks[0] as { ordered: boolean; items: unknown[] };
    expect(list.ordered).toBe(false);
    expect(list.items.map(flatten)).toEqual(['a', 'b', 'c']);
  });

  it('sépare une liste ordonnée d’une liste à puces', () => {
    const blocks = parseMarkdown('1. a\n2. b\n- c');
    expect(blocks.map((b) => (b.type === 'list' ? b.ordered : null))).toEqual([true, false]);
  });

  it('rend un filet, et non un paragraphe de tirets', () => {
    expect(parseMarkdown('a\n\n---\n\nb').map((b) => b.type)).toEqual([
      'paragraph',
      'rule',
      'paragraph',
    ]);
  });

  it('coupe les paragraphes sur les lignes vides et garde les retours internes', () => {
    const blocks = parseMarkdown('one\ntwo\n\nthree');
    expect(blocks).toHaveLength(2);
    expect(flatten((blocks[0] as { content: unknown }).content)).toBe('one\ntwo');
  });
});

describe('parseMarkdown — tableaux', () => {
  const table = [
    '| Ability | You | Refs |',
    '| --- | ---: | :---: |',
    '| Fireball | 12,000 | 15,000 |',
    '| Pyroblast | 8,000 | 9,500 |',
  ].join('\n');

  it('rend un tableau, pas des pipes littéraux', () => {
    const blocks = parseMarkdown(table);
    expect(blocks).toHaveLength(1);
    const t = blocks[0] as { type: string; header: unknown[]; rows: unknown[][]; align: unknown[] };
    expect(t.type).toBe('table');
    expect(t.header.map(flatten)).toEqual(['Ability', 'You', 'Refs']);
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0].map(flatten)).toEqual(['Fireball', '12,000', '15,000']);
  });

  it("lit l'alignement écrit dans la ligne de séparation", () => {
    const t = parseMarkdown(table)[0] as { align: unknown[] };
    expect(t.align).toEqual([null, 'right', 'center']);
  });

  it('accepte un tableau sans pipes de bord', () => {
    const t = parseMarkdown('a | b\n--- | ---\n1 | 2')[0] as { type: string; rows: unknown[][] };
    expect(t.type).toBe('table');
    expect(t.rows[0].map(flatten)).toEqual(['1', '2']);
  });

  it('complète une ligne plus courte que son en-tête au lieu de décaler les colonnes', () => {
    const t = parseMarkdown('| a | b | c |\n| --- | --- | --- |\n| 1 |')[0] as {
      rows: unknown[][];
    };
    expect(t.rows[0]).toHaveLength(3);
    expect(t.rows[0].map(flatten)).toEqual(['1', '', '']);
  });

  it('rend l’en-tête seul en paragraphe tant que la ligne de séparation n’est pas arrivée', () => {
    // En flux : l'état intermédiaire doit se rendre, puis se corriger au chunk suivant.
    expect(parseMarkdown('| Ability | You |').map((b) => b.type)).toEqual(['paragraph']);
    expect(parseMarkdown('| Ability | You |\n| --- | --- |').map((b) => b.type)).toEqual(['table']);
  });

  it('ferme le tableau sur la première ligne qui n’en est pas une', () => {
    const blocks = parseMarkdown(`${table}\n\nAfter the table.`);
    expect(blocks.map((b) => b.type)).toEqual(['table', 'paragraph']);
  });

  it('rend les nombres des cellules en nœuds `num`', () => {
    const t = parseMarkdown(table)[0] as { rows: { type: string }[][][] };
    expect(t.rows[0][1]).toEqual([{ type: 'num', value: '12,000' }]);
  });
});
