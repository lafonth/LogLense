import type { BossResult, Comparability, DamageEntry } from '@/types';
import { describe, expect, it } from 'vitest';
import { leadingGap } from '../leading-gap';

const GUIDS: Record<string, number> = { Shred: 5221, Rip: 1079, Barkskin: 22812 };
const guidOf = (name: string) => GUIDS[name] ?? 0;

/** Toutes les pulls du fichier durent quatre minutes — d'où le `× 4` des comptes absolus. */
const FIGHT_MINUTES = 4;

const casts = (perMin: Record<string, number>) =>
  Object.fromEntries(
    Object.entries(perMin).map(([name, v]) => [
      name,
      { guid: guidOf(name), casts: Math.round(v * FIGHT_MINUTES), perMin: v },
    ])
  );

const damage = (totals: Record<string, number>): DamageEntry[] =>
  Object.entries(totals).map(([name, total]) => ({ guid: guidOf(name), name, total }));

interface Over {
  dps?: number;
  refDps?: number;
  mine?: Record<string, number>;
  myDamage?: Record<string, number>;
  references?: Record<string, number>[];
  referenceDamage?: Record<string, number>;
  comparability?: Partial<Comparability>;
  fightMinutes?: number;
}

/**
 * `leadingGap` lit du résultat ce que `buildVerdict`, `damageGaps` et `compareCasts` lisent :
 * le dps du sujet **et celui de chaque référence**, les deux tables de dégâts — qui portent
 * désormais le classement —, la comparabilité, l'échantillon, les deux tables de rotation, et
 * la durée de la pull, qui convertit une cadence en nombre de lancers.
 *
 * Par défaut un seul sort porte tous les dégâts des deux côtés : Shred est alors la tête du
 * classement quoi qu'il arrive, et chaque cas n'exerce que la porte qu'il vise.
 */
function result(over: Over = {}): BossResult {
  return {
    character: {
      dps: over.dps ?? 100000,
      rotation: {
        casts: casts(over.mine ?? { Shred: 10 }),
        fightDurationMs: (over.fightMinutes ?? FIGHT_MINUTES) * 60_000,
      },
      damageTable: { entries: damage(over.myDamage ?? { Shred: 1000 }) },
      context: null,
    },
    sample: [{ dps: 120000, qualified: true }],
    topPlayers: (over.references ?? [{ Shred: 10 }, { Shred: 10 }]).map((perMin) => ({
      stats: { dps: over.refDps ?? 120000 },
      rotation: { casts: casts(perMin) },
      damageTable: { entries: damage(over.referenceDamage ?? { Shred: 1000 }) },
    })),
    comparability: {
      level: 'close',
      substituted: 0,
      poolDps: null,
      poolIlvl: null,
      poolIlvlCount: 0,
      referenceIlvl: 285,
      myIlvl: 284,
      ...over.comparability,
    },
  } as unknown as BossResult;
}

describe('leadingGap', () => {
  // Le sort nommé est celui que la liste de constats met en premier, et le classement de
  // cette liste est en dps : Rip coûte +24 000 dps là où Shred en rend 4 000, alors même que
  // ma cadence de Shred est presque celle des références. La cadence n'ordonne rien ici —
  // elle décide seulement si la phrase a le droit d'être dite.
  it('names the ability at the head of the findings list', () => {
    const lead = leadingGap(
      result({
        mine: { Shred: 10, Rip: 2 },
        myDamage: { Shred: 700, Rip: 300 },
        references: [
          { Shred: 10.2, Rip: 4 },
          { Shred: 10, Rip: 4 },
          { Shred: 9.8, Rip: 4 },
        ],
        referenceDamage: { Shred: 550, Rip: 450 },
      })
    );

    expect(lead?.ability).toBe('Rip');
    expect(lead?.mine).toBe(2);
    expect(lead?.reference).toBe(4);
    expect(lead?.deviationPct).toBe(-50);
  });

  // Barkskin ne figure dans aucune des deux tables de dégâts : il n'entre donc pas dans
  // l'union classée, et la bannière ne peut pas le nommer — quel que soit l'écart de cadence.
  // C'est le classement en dps qui l'écarte, pas une pondération du tri des cadences.
  it('does not name a spell that costs nothing, however far off it is', () => {
    const lead = leadingGap(
      result({
        mine: { Shred: 8, Barkskin: 3 },
        myDamage: { Shred: 1_000_000 },
        references: [
          { Shred: 10, Barkskin: 1 },
          { Shred: 10, Barkskin: 1 },
        ],
        referenceDamage: { Shred: 1_000_000 },
      })
    );

    expect(lead?.ability).toBe('Shred');
  });

  // Le plancher mesuré : quand les références se dispersent entre elles plus que je ne
  // m'écarte d'elles, la donnée ne me sépare pas d'elles. Aucun seuil à régler à la main.
  it('says nothing when the player sits inside the spread of the references', () => {
    expect(
      leadingGap(result({ mine: { Shred: 10 }, references: [{ Shred: 9.4 }, { Shred: 10.6 }] }))
    ).toBeNull();
  });

  // Des références serrées ne suffisent pas : encore faut-il que l'écart pèse. À 0,2 lancer
  // par minute sur quatre minutes, c'est moins d'un cast — exactement ce qu'une pull produit
  // sans qu'on ait rien joué de différent.
  it('says nothing when the gap amounts to less than two casts over the pull', () => {
    expect(
      leadingGap(result({ mine: { Shred: 10 }, references: [{ Shred: 10.2 }, { Shred: 10.2 }] }))
    ).toBeNull();
  });

  // Le même écart de cadence, sur une pull assez longue pour qu'il fasse des lancers.
  it('names it once the same cadence gap has produced enough casts', () => {
    const over = { mine: { Shred: 10 }, references: [{ Shred: 10.2 }, { Shred: 10.2 }] };

    expect(leadingGap(result({ ...over, fightMinutes: 12 }))?.ability).toBe('Shred');
  });

  // Nommer *le* sort où l'écart se lit est un superlatif sur une distribution : avec une
  // seule référence, min, max et médiane sont le même point et il n'y a pas de distribution.
  it('says nothing when a single reference survived', () => {
    expect(leadingGap(result({ mine: { Shred: 4 }, references: [{ Shred: 10 }] }))).toBeNull();
  });

  // Même règle que le delta de DPS un cran plus haut : un panel illégitime ne chiffre rien,
  // et désigner un sort responsable dirait par la bande ce que le verdict refuse de dire.
  it('names nothing when the verdict itself refuses to state a gap', () => {
    const over = { mine: { Shred: 4 }, references: [{ Shred: 10 }, { Shred: 10 }] };

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
      result({ dps: 130000, mine: { Shred: 14 }, references: [{ Shred: 10 }, { Shred: 10 }] })
    );

    expect(lead?.ability).toBe('Shred');
    expect(lead?.deviationPct).toBe(40);
  });

  // Le signe du sort de tête est libre : celui dont l'écart coûte le plus peut parfaitement
  // être un sort qu'on lance *plus* que les références, dans un verdict où l'on est derrière.
  // C'est pourquoi la bannière n'affirme aucune direction — elle montre les deux cadences.
  it('names a spell the player over-casts even when the verdict is a gap', () => {
    const lead = leadingGap(
      result({ dps: 100000, mine: { Shred: 14 }, references: [{ Shred: 10 }, { Shred: 10 }] })
    );

    expect(lead?.ability).toBe('Shred');
    expect(lead?.deviationPct).toBeGreaterThan(0);
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
