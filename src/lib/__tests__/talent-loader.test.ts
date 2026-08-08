import { describe, expect, it } from 'vitest';
import { getTalentNodes } from '../talent-loader';

describe('getTalentNodes', () => {
  it('loads the tree of a spec that has one generated', () => {
    const nodes = getTalentNodes(103);

    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes[0]).toMatchObject({ id: expect.any(Number), name: expect.any(String) });
  });

  // Une spec sans arbre généré ne doit pas faire tomber l'analyse : le panneau des talents
  // disparaît, le reste du rapport tient.
  it('returns an empty tree rather than throwing for a spec with no file', () => {
    expect(getTalentNodes(999999)).toEqual([]);
  });
});
