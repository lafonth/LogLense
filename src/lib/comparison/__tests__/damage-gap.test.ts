import type { BossResult, DamageEntry, TopPlayer } from '@/types';
import { describe, expect, it } from 'vitest';
import { damageGaps } from '../damage-gap';

const GUIDS: Record<string, number> = { Starfall: 191037, Wrath: 190984, Starfire: 194153 };
const guidOf = (name: string) => GUIDS[name] ?? 0;

const damage = (totals: Record<string, number>): DamageEntry[] =>
  Object.entries(totals).map(([name, total]) => ({ guid: guidOf(name), name, total }));

const subject = (dps: number, totals: Record<string, number>) => ({
  dps,
  damageTable: { entries: damage(totals) },
});

const reference = (dps: number, totals: Record<string, number>): TopPlayer =>
  ({
    stats: { dps },
    damageTable: { entries: damage(totals) },
  }) as unknown as TopPlayer;

const rowFor = (rows: ReturnType<typeof damageGaps>, name: string) =>
  rows.find((r) => r.name === name);

describe('damageGaps', () => {
  it('brings in an ability the field converts and I barely do', () => {
    // Starfall ne pèse rien chez moi et un cinquième chez eux : il n'entrerait pas dans mon
    // top pris seul, et c'est exactement la ligne qu'on veut voir.
    const rows = damageGaps(subject(100_000, { Wrath: 990, Starfall: 10 }), [
      reference(120_000, { Wrath: 800, Starfall: 200 }),
      reference(120_000, { Wrath: 800, Starfall: 200 }),
    ]);

    const starfall = rowFor(rows, 'Starfall');
    expect(starfall).toBeDefined();
    expect(starfall!.minePct).toBeCloseTo(1);
    expect(starfall!.fieldPct).toBeCloseTo(20);
    expect(starfall!.mineDps).toBeCloseTo(1_000);
    expect(starfall!.fieldDps).toBeCloseTo(24_000);
    expect(starfall!.gapDps).toBeCloseTo(23_000);
    expect(starfall!.referenceTotal).toBe(2);
  });

  it('leaves fieldDps null when no reference carries the ability', () => {
    const rows = damageGaps(subject(100_000, { Wrath: 900, Starfall: 100 }), [
      reference(120_000, {}),
      reference(120_000, {}),
    ]);

    const starfall = rowFor(rows, 'Starfall');
    expect(starfall).toBeDefined();
    expect(starfall!.fieldPct).toBeNull();
    expect(starfall!.fieldDps).toBeNull();
    expect(starfall!.gapDps).toBeNull();
    // Une table vide est un log illisible, pas un joueur qui n'a rien fait : elle sort de
    // l'effectif au lieu de compter pour zéro.
    expect(starfall!.referenceTotal).toBe(0);
  });

  it('counts a readable reference that never cast the ability as a real zero', () => {
    const rows = damageGaps(subject(100_000, { Wrath: 500, Starfall: 500 }), [
      reference(100_000, { Wrath: 1000 }),
      reference(100_000, { Wrath: 1000 }),
    ]);

    const starfall = rowFor(rows, 'Starfall');
    expect(starfall!.fieldPct).toBe(0);
    expect(starfall!.fieldDps).toBe(0);
    expect(starfall!.gapDps).toBeCloseTo(-50_000);
    expect(starfall!.referenceTotal).toBe(2);
  });

  it('sorts the widest |gapDps| first and pushes the fieldless rows to the tail', () => {
    const rows = damageGaps(subject(100_000, { Wrath: 500, Starfire: 400, Starfall: 100 }), [
      reference(100_000, { Wrath: 300, Starfire: 450, Starfall: 250 }),
      reference(100_000, { Wrath: 300, Starfire: 450, Starfall: 250 }),
    ]);

    // Wrath : |30 − 50| = 20 points ; Starfall : |25 − 10| = 15 ; Starfire : |45 − 40| = 5.
    expect(rows.map((r) => r.name)).toEqual(['Wrath', 'Starfall', 'Starfire']);
    expect(rows.every((r) => r.gapDps !== null)).toBe(true);
  });

  it('falls back on my own ranking when no reference table is readable', () => {
    // Un `fieldDps` nul est global, jamais par sort : une référence lisible qui n'a pas
    // lancé le sort compte pour un vrai zéro. Seules des tables toutes vides le produisent,
    // et il ne reste alors que mon propre classement pour ordonner.
    const rows = damageGaps(subject(100_000, { Wrath: 600, Starfall: 400 }), [
      reference(100_000, {}),
      reference(100_000, {}),
    ]);

    expect(rows.map((r) => r.name)).toEqual(['Wrath', 'Starfall']);
    expect(rows.every((r) => r.gapDps === null)).toBe(true);
  });

  it('does not divide by zero when the subject produced no damage', () => {
    const rows = damageGaps(subject(0, {}), [
      reference(100_000, { Wrath: 1000 }),
      reference(100_000, { Wrath: 1000 }),
    ]);

    const wrath = rowFor(rows, 'Wrath');
    expect(wrath).toBeDefined();
    expect(wrath!.minePct).toBe(0);
    expect(wrath!.mineDps).toBe(0);
    expect(wrath!.fieldDps).toBeCloseTo(100_000);
    expect(wrath!.gapDps).toBeCloseTo(100_000);
    expect(rows.every((r) => Number.isFinite(r.mineDps))).toBe(true);
  });

  it('returns nothing at all when neither side produced damage', () => {
    expect(damageGaps(subject(0, {}), [reference(0, {}), reference(0, {})])).toEqual([]);
  });

  it('carries the guid so a caller can join back onto the cast table', () => {
    const rows = damageGaps(subject(100_000, { Wrath: 1000 }), [
      reference(100_000, { Starfall: 1000 }),
    ]);

    expect(rowFor(rows, 'Wrath')!.guid).toBe(GUIDS.Wrath);
    expect(rowFor(rows, 'Starfall')!.guid).toBe(GUIDS.Starfall);
  });

  it('works with no references at all', () => {
    const rows = damageGaps(subject(100_000, { Wrath: 1000 }), [] as BossResult['topPlayers']);

    expect(rows).toHaveLength(1);
    expect(rows[0].gapDps).toBeNull();
    expect(rows[0].referenceTotal).toBe(0);
  });
});
