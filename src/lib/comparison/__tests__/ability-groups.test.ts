import type { AbilityComparison } from '../rotation-stats';
import { describe, expect, it } from 'vitest';
import { groupCasts, groupUptimes } from '../ability-groups';

/** Seuls `name` et `damageShare` pèsent sur le regroupement ; le reste est du remplissage. */
function row(name: string, damageShare: number | null): AbilityComparison {
  return {
    name,
    mine: 1,
    referenceMin: 1,
    referenceMax: 2,
    referenceMedian: 1.5,
    deviationPct: -10,
    referenceTotal: 2,
    damageShare,
  };
}

const labels = (groups: { label: string }[]) => groups.map((g) => g.label);
const namesOf = (rows: AbilityComparison[]) => rows.map((r) => r.name);

describe('groupCasts', () => {
  it('separates damaging casts from the rest', () => {
    const groups = groupCasts([row('Shred', 0.42), row('Barkskin', 0), row('Rip', 0.18)]);

    expect(labels(groups)).toEqual(['Damaging', 'Non-damaging']);
    expect(namesOf(groups[0].rows)).toEqual(['Shred', 'Rip']);
    expect(namesOf(groups[1].rows)).toEqual(['Barkskin']);
  });

  // Le tri par coût a déjà tranché en amont : regrouper ne doit pas rejouer l'ordre, sinon
  // un sort que la pondération avait relégué remonte sans raison visible.
  it('preserves the incoming order inside each group', () => {
    const groups = groupCasts([
      row('Shred', 0.5),
      row('Barkskin', 0),
      row('Rip', 0.3),
      row("Tiger's Fury", 0),
    ]);

    expect(namesOf(groups[0].rows)).toEqual(['Shred', 'Rip']);
    expect(namesOf(groups[1].rows)).toEqual(['Barkskin', "Tiger's Fury"]);
  });

  it('drops the header when a single group would carry every row', () => {
    expect(groupCasts([row('Shred', 0.6), row('Rip', 0.4)])).toEqual([
      { label: '', rows: [row('Shred', 0.6), row('Rip', 0.4)] },
    ]);
  });

  // Sans table de dégâts, la pondération n'a pas eu lieu : trancher déclarerait toute la
  // rotation non-damageante, ce qui est faux et pas seulement imprécis.
  it('leaves the list flat when no damage share was computed at all', () => {
    const groups = groupCasts([row('Shred', null), row('Barkskin', null)]);

    expect(labels(groups)).toEqual(['']);
    expect(namesOf(groups[0].rows)).toEqual(['Shred', 'Barkskin']);
  });

  it('returns no group at all for an empty list', () => {
    expect(groupCasts([])).toEqual([]);
  });
});

describe('groupUptimes', () => {
  it('separates auras that come from a cast from procs and passives', () => {
    const groups = groupUptimes(
      [row('Rip', null), row('Bloodtalons', null), row("Tiger's Fury", null)],
      new Set(['Rip', "Tiger's Fury", 'Shred'])
    );

    expect(labels(groups)).toEqual(['From your casts', 'Procs and passives']);
    expect(namesOf(groups[0].rows)).toEqual(['Rip', "Tiger's Fury"]);
    expect(namesOf(groups[1].rows)).toEqual(['Bloodtalons']);
  });

  it('drops the header when every aura is a proc', () => {
    const groups = groupUptimes([row('Bloodtalons', null)], new Set(['Shred']));

    expect(labels(groups)).toEqual(['']);
    expect(namesOf(groups[0].rows)).toEqual(['Bloodtalons']);
  });

  it('returns no group at all for an empty list', () => {
    expect(groupUptimes([], new Set(['Shred']))).toEqual([]);
  });
});
