import type { BossResult, Comparability, DamageEntry } from '@/types';
import { describe, expect, it } from 'vitest';
import { leadingGap } from '../leading-gap';

const GUIDS: Record<string, number> = { Shred: 5221, Rip: 1079, Barkskin: 22812 };
const guidOf = (name: string) => GUIDS[name] ?? 0;

const casts = (perMin: Record<string, number>) =>
  Object.fromEntries(
    Object.entries(perMin).map(([name, v]) => [
      name,
      { guid: guidOf(name), casts: Math.round(v * 4), perMin: v },
    ])
  );

const damage = (totals: Record<string, number>): DamageEntry[] =>
  Object.entries(totals).map(([name, total]) => ({ guid: guidOf(name), name, total }));

interface Over {
  dps?: number;
  mine?: Record<string, number>;
  myDamage?: Record<string, number>;
  references?: Record<string, number>[];
  referenceDamage?: Record<string, number>;
  comparability?: Partial<Comparability>;
}

/**
 * `leadingGap` ne lit du résultat que ce que `buildVerdict` et `compareCasts` lisent : le
 * dps du sujet, la comparabilité, l'échantillon, et les deux tables de rotation. Fabriquer
 * un `BossResult` entier n'apprendrait rien de plus au test.
 */
function result(over: Over = {}): BossResult {
  return {
    character: {
      dps: over.dps ?? 100000,
      rotation: { casts: casts(over.mine ?? { Shred: 10 }) },
      damageTable: { entries: damage(over.myDamage ?? {}) },
    },
    sample: [{ dps: 120000, qualified: true }],
    topPlayers: (over.references ?? [{ Shred: 10 }]).map((perMin) => ({
      rotation: { casts: casts(perMin) },
      damageTable: { entries: damage(over.referenceDamage ?? {}) },
    })),
    comparability: {
      level: 'close',
      substituted: 0,
      referenceIlvl: 285,
      myIlvl: 284,
      ...over.comparability,
    },
  } as unknown as BossResult;
}

describe('leadingGap', () => {
  it('names the ability whose cadence is furthest from the references', () => {
    const lead = leadingGap(
      result({
        mine: { Shred: 10, Rip: 2 },
        references: [
          { Shred: 10.2, Rip: 4 },
          { Shred: 10, Rip: 4 },
          { Shred: 9.8, Rip: 4 },
        ],
      })
    );

    expect(lead?.ability).toBe('Rip');
    expect(lead?.mine).toBe(2);
    expect(lead?.reference).toBe(4);
    expect(lead?.deviationPct).toBe(-50);
  });

  // Le tri de `compareCasts` pondère par la part de dégâts : un sort rare et sans
  // conséquence produit de gros pourcentages et ne coûte rien. La ligne du verdict hérite
  // de cette pondération — sinon elle nommerait Barkskin.
  it('does not name a spell that costs nothing, however far off it is', () => {
    const lead = leadingGap(
      result({
        mine: { Shred: 8, Barkskin: 3 },
        myDamage: { Shred: 1_000_000 },
        references: [{ Shred: 10, Barkskin: 1 }],
        referenceDamage: { Shred: 1_000_000 },
      })
    );

    expect(lead?.ability).toBe('Shred');
  });

  // Sur trois minutes, un sort lancé une fois de plus produit déjà quelques pourcents. Les
  // nommer comme *l'*endroit du retard serait affirmer plus que les données ne portent.
  it('says nothing when the leading gap is within the noise of one pull', () => {
    expect(leadingGap(result({ mine: { Shred: 10 }, references: [{ Shred: 10.5 }] }))).toBeNull();
  });

  // Même règle que le delta de DPS un cran plus haut : un panel illégitime ne chiffre rien,
  // et désigner un sort responsable dirait par la bande ce que le verdict refuse de dire.
  it('names nothing when the verdict itself refuses to state a gap', () => {
    const over = { mine: { Shred: 4 }, references: [{ Shred: 10 }] };

    expect(leadingGap(result({ ...over, comparability: { level: 'poor' } }))).toBeNull();
    expect(leadingGap(result({ ...over, comparability: { substituted: 2 } }))).toBeNull();
    expect(leadingGap(result({ ...over, comparability: { level: 'none' } }))).toBeNull();
  });

  it('says nothing when no reference rotation was fetched', () => {
    expect(leadingGap(result({ references: [] }))).toBeNull();
  });

  // L'écart se lit aussi quand le joueur est devant : il n'est simplement plus un retard.
  it('still names the ability when the player leads the references', () => {
    const lead = leadingGap(
      result({ dps: 130000, mine: { Shred: 14 }, references: [{ Shred: 10 }] })
    );

    expect(lead?.ability).toBe('Shred');
    expect(lead?.deviationPct).toBe(40);
  });

  // Une médiane sur une seule référence se lit comme une médiane sur trois : c'est la leçon
  // déjà tirée sur l'ilvl du panneau de comparabilité.
  it('carries how many references the median was taken on', () => {
    const lead = leadingGap(
      result({ mine: { Shred: 4 }, references: [{ Shred: 10 }, { Shred: 12 }] })
    );

    expect(lead?.referenceTotal).toBe(2);
  });

  it('rounds the cadences to a tenth, as the comparison tab shows them', () => {
    const lead = leadingGap(
      result({ mine: { Shred: 4.06 }, references: [{ Shred: 10.44 }, { Shred: 10.44 }] })
    );

    expect(lead?.mine).toBe(4.1);
    expect(lead?.reference).toBe(10.4);
  });
});
