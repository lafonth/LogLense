import type { DamageEntry, TopPlayer } from '@/types';
import { describe, expect, it } from 'vitest';
import { abilityTable } from '../ability-table';

const GUIDS: Record<string, number> = {
  Wrath: 190984,
  Starfall: 191037,
  Starfire: 194153,
  Disintegrate: 356995,
};

interface Counts {
  total: number;
  uses?: number;
  hitCount?: number;
  tickCount?: number;
}

const damage = (spells: Record<string, Counts>): DamageEntry[] =>
  Object.entries(spells).map(([name, c]) => ({ guid: GUIDS[name] ?? 0, name, ...c }));

const subject = (dps: number, spells: Record<string, Counts>) => ({
  dps,
  damageTable: { entries: damage(spells) },
});

const reference = (dps: number, spells: Record<string, Counts>): TopPlayer =>
  ({ stats: { dps }, damageTable: { entries: damage(spells) } }) as unknown as TopPlayer;

const rowFor = (table: ReturnType<typeof abilityTable>, name: string) =>
  table.rows.find((r) => r.name === name)!;

describe('abilityTable', () => {
  it('joins my six columns with the field median, column by column', () => {
    // Le dénominateur de `avgCast` est `uses` — le compte que WCL rattache dans la table de
    // dégâts — et non la table des casts, qui compte deux fois un sort empouvoiré.
    const table = abilityTable(
      subject(100_000, {
        Wrath: { total: 900, uses: 30, hitCount: 30, tickCount: 0 },
        Starfall: { total: 100, uses: 2, hitCount: 20, tickCount: 0 },
      }),
      [
        reference(100_000, {
          Wrath: { total: 800, uses: 20, hitCount: 40, tickCount: 0 },
          Starfall: { total: 200, uses: 4, hitCount: 40, tickCount: 0 },
        }),
        reference(100_000, {
          Wrath: { total: 800, uses: 20, hitCount: 40, tickCount: 0 },
          Starfall: { total: 200, uses: 4, hitCount: 40, tickCount: 0 },
        }),
      ]
    );

    const wrath = rowFor(table, 'Wrath');
    expect(wrath.mine).toMatchObject({ amount: 900, casts: 30, avgCast: 30, hits: 30, avgHit: 30 });
    expect(wrath.mine.dps).toBeCloseTo(90_000);
    expect(wrath.field).toMatchObject({
      amount: 800,
      casts: 20,
      avgCast: 40,
      hits: 40,
      avgHit: 20,
    });
    expect(wrath.field!.dps).toBeCloseTo(80_000);
    expect(wrath.deviationPct).toBeCloseTo(12.5);
    expect(table.hasCasts).toBe(true);
    expect(table.hasHits).toBe(true);
    expect(table.referenceTotal).toBe(2);
  });

  it('carries the min-max of the field shares as the watermark', () => {
    const table = abilityTable(subject(100_000, { Wrath: { total: 1000 } }), [
      reference(100_000, { Wrath: { total: 600 }, Starfall: { total: 400 } }),
      reference(100_000, { Wrath: { total: 800 }, Starfall: { total: 200 } }),
      reference(100_000, { Wrath: { total: 700 }, Starfall: { total: 300 } }),
    ]);

    const wrath = rowFor(table, 'Wrath');
    expect(wrath.minePct).toBeCloseTo(100);
    expect(wrath.fieldPct).toBeCloseTo(70);
    expect(wrath.fieldPctMin).toBeCloseTo(60);
    expect(wrath.fieldPctMax).toBeCloseTo(80);
  });

  it('counts ticks as hits, so a channel gets an average hit', () => {
    const table = abilityTable(
      subject(100_000, { Disintegrate: { total: 1000, uses: 12, hitCount: 0, tickCount: 308 } }),
      []
    );

    const chan = rowFor(table, 'Disintegrate');
    expect(chan.mine.hits).toBe(308);
    expect(chan.mine.avgHit).toBeCloseTo(1000 / 308);
  });

  it('leaves casts null on a proc WCL attributes to nothing, and never zero', () => {
    // Sans dénominateur, il n'y a pas de coût moyen — il n'y en a pas un nul.
    const table = abilityTable(
      subject(100_000, {
        Wrath: { total: 900, uses: 30, hitCount: 30 },
        Starfall: { total: 100, hitCount: 4 },
      }),
      []
    );

    const proc = rowFor(table, 'Starfall');
    expect(proc.mine.casts).toBeNull();
    expect(proc.mine.avgCast).toBeNull();
    expect(proc.mine.amount).toBe(100);
    expect(proc.mine.hits).toBe(4);
    expect(proc.mine.avgHit).toBeCloseTo(25);
  });

  it('nulls the count columns on a snapshot written before the parse kept them', () => {
    const table = abilityTable(subject(100_000, { Wrath: { total: 1000 } }), [
      reference(100_000, { Wrath: { total: 1000 } }),
    ]);

    expect(table.hasCasts).toBe(false);
    expect(table.hasHits).toBe(false);
    const wrath = rowFor(table, 'Wrath');
    expect(wrath.mine).toMatchObject({ casts: null, avgCast: null, hits: null, avgHit: null });
    expect(wrath.field).toMatchObject({ casts: null, avgCast: null, hits: null, avgHit: null });
    // Ce qui est mesuré reste mesuré : seules les colonnes de compte tombent.
    expect(wrath.mine.amount).toBe(1000);
    expect(wrath.field!.amount).toBe(1000);
  });

  it('counts a readable reference that never cast the ability as a real zero', () => {
    const table = abilityTable(
      subject(100_000, {
        Wrath: { total: 900, uses: 30 },
        Starfall: { total: 100, uses: 2 },
      }),
      [
        reference(100_000, { Wrath: { total: 1000, uses: 25 } }),
        reference(100_000, { Wrath: { total: 500, uses: 20 }, Starfall: { total: 500, uses: 10 } }),
      ]
    );

    const starfall = rowFor(table, 'Starfall');
    expect(starfall.field!.casts).toBe(5);
    expect(starfall.referenceTotal).toBe(2);
  });

  it('drops an unreadable reference from the field instead of counting it as zero', () => {
    const table = abilityTable(subject(100_000, { Wrath: { total: 1000, uses: 30 } }), [
      reference(100_000, { Wrath: { total: 1000, uses: 20 } }),
      reference(100_000, {}),
    ]);

    const wrath = rowFor(table, 'Wrath');
    expect(wrath.field!.casts).toBe(20);
    expect(wrath.referenceTotal).toBe(1);
    expect(table.referenceTotal).toBe(1);
  });

  it('leaves the whole field side null without a single readable reference', () => {
    const table = abilityTable(subject(100_000, { Wrath: { total: 1000, uses: 30 } }), []);

    const wrath = rowFor(table, 'Wrath');
    expect(wrath.field).toBeNull();
    expect(wrath.fieldPct).toBeNull();
    expect(wrath.fieldPctMin).toBeNull();
    expect(wrath.deviationPct).toBeNull();
    expect(table.total.field).toBeNull();
    expect(table.total.deviationPct).toBeNull();
  });

  it('totals the whole table, and its dps is the player dps', () => {
    const table = abilityTable(
      subject(100_000, {
        Wrath: { total: 900, uses: 30, hitCount: 30 },
        Starfall: { total: 100, uses: 2, hitCount: 20 },
      }),
      [reference(80_000, { Wrath: { total: 1000, uses: 25, hitCount: 50 } })]
    );

    expect(table.total.mine).toMatchObject({ amount: 1000, casts: 32, hits: 50, dps: 100_000 });
    expect(table.total.mine.avgCast).toBeCloseTo(1000 / 32);
    expect(table.total.field).toMatchObject({ amount: 1000, casts: 25, hits: 50, dps: 80_000 });
    expect(table.total.deviationPct).toBeCloseTo(25);
  });

  it('sorts on the larger of the two shares, so a field-only ability stays on top', () => {
    const table = abilityTable(
      subject(100_000, { Wrath: { total: 900 }, Starfire: { total: 100 } }),
      [reference(100_000, { Wrath: { total: 500 }, Starfall: { total: 500 } })]
    );

    // Starfall pèse la moitié des dégâts du champ et rien chez moi : il passe devant Starfire.
    expect(table.rows.map((r) => r.name)).toEqual(['Wrath', 'Starfall', 'Starfire']);
  });
});
