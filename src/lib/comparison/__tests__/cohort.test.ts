import type { CharacterStats, ReferenceSample } from '@/types';
import { describe, expect, it } from 'vitest';
import { applyCohortFilter, describeCohort } from '../cohort';

function stats(over: Partial<CharacterStats> = {}): CharacterStats {
  return {
    name: 'Ref',
    avgIlvl: 640,
    primaryStat: 13000,
    crit: 4000,
    haste: 3500,
    mastery: 5800,
    vers: 800,
    talents: {},
    ...over,
  };
}

function entry(name: string, over: Partial<ReferenceSample> = {}): ReferenceSample {
  return {
    name,
    code: `code-${name}`,
    fightID: 1,
    actorId: 4,
    stats: stats({ name }),
    dps: 300000,
    killTimeMs: 200000,
    qualified: true,
    tierPieces: 2,
    externalUptime: 0,
    explored: false,
    ...over,
  };
}

const subject = {
  stats: stats({ name: 'Me' }),
  dps: 280000,
  killTimeMs: 200000,
};

const names = (sample: ReferenceSample[]) => sample.map((s) => s.name);

describe('applyCohortFilter', () => {
  it('keeps every qualified candidate under an empty filter', () => {
    const sample = [entry('A'), entry('B')];

    expect(names(applyCohortFilter(sample, {}, 640))).toEqual(['A', 'B']);
  });

  it('leaves the disqualified out until they are asked for', () => {
    const sample = [entry('A'), entry('Boosted', { qualified: false })];

    expect(names(applyCohortFilter(sample, {}, 640))).toEqual(['A']);
    expect(names(applyCohortFilter(sample, { includeDisqualified: true }, 640))).toEqual([
      'A',
      'Boosted',
    ]);
  });

  it('matches tier pieces exactly, not as a floor', () => {
    const sample = [entry('Two', { tierPieces: 2 }), entry('Four', { tierPieces: 4 })];

    expect(names(applyCohortFilter(sample, { tierPieces: 4 }, 640))).toEqual(['Four']);
  });

  it('excludes an unread gear set rather than counting it as zero pieces', () => {
    // `null` veut dire « équipement non lu ». Le compter à zéro ferait lire un défaut de
    // collecte comme une observation : le candidat sortirait sur un filtre à 4p, et
    // rentrerait sur un filtre à 0p qu'on ne l'a jamais observé remplir.
    const sample = [entry('Unread', { tierPieces: null })];

    expect(applyCohortFilter(sample, { tierPieces: 0 }, 640)).toEqual([]);
    expect(applyCohortFilter(sample, { tierPieces: 4 }, 640)).toEqual([]);
    expect(names(applyCohortFilter(sample, {}, 640))).toEqual(['Unread']);
  });

  it('bounds kill time on both sides, inclusively', () => {
    const sample = [
      entry('Fast', { killTimeMs: 180000 }),
      entry('Mid', { killTimeMs: 240000 }),
      entry('Slow', { killTimeMs: 300000 }),
    ];

    expect(names(applyCohortFilter(sample, { maxKillTimeMs: 240000 }, 640))).toEqual([
      'Fast',
      'Mid',
    ]);
    expect(names(applyCohortFilter(sample, { minKillTimeMs: 240000 }, 640))).toEqual([
      'Mid',
      'Slow',
    ]);
    expect(
      names(applyCohortFilter(sample, { minKillTimeMs: 200000, maxKillTimeMs: 260000 }, 640))
    ).toEqual(['Mid']);
  });

  it('caps external uptime at the asked-for value', () => {
    const sample = [entry('Clean', { externalUptime: 0 }), entry('Buffed', { externalUptime: 12 })];

    expect(names(applyCohortFilter(sample, { maxExternalUptime: 10 }, 640))).toEqual(['Clean']);
  });

  it('measures ilvl distance from the subject, in both directions', () => {
    const sample = [
      entry('Under', { stats: stats({ name: 'Under', avgIlvl: 638 }) }),
      entry('Same', { stats: stats({ name: 'Same', avgIlvl: 640 }) }),
      entry('Over', { stats: stats({ name: 'Over', avgIlvl: 643 }) }),
    ];

    expect(names(applyCohortFilter(sample, { ilvlWithin: 2 }, 640))).toEqual(['Under', 'Same']);
  });

  it('retains nobody on an ilvl filter when the subject has no item level', () => {
    // Même convention que `scoreCandidate` : sans ilvl du sujet, aucun candidat ne peut être
    // jugé proche sur l'équipement. Tout rendre reviendrait à répondre « ils sont tous à ton
    // ilvl » à un joueur dont on ignore l'ilvl.
    const sample = [entry('A'), entry('B')];

    expect(applyCohortFilter(sample, { ilvlWithin: 2 }, 0)).toEqual([]);
  });

  it('combines every axis given at once', () => {
    const sample = [
      entry('Keeper', { tierPieces: 4, killTimeMs: 190000 }),
      entry('TooSlow', { tierPieces: 4, killTimeMs: 400000 }),
      entry('TwoPiece', { tierPieces: 2, killTimeMs: 190000 }),
    ];

    const kept = applyCohortFilter(sample, { tierPieces: 4, maxKillTimeMs: 200000 }, 640);

    expect(names(kept)).toEqual(['Keeper']);
  });
});

describe('describeCohort', () => {
  it('counts what the filter kept and what it dropped from the whole pool', () => {
    const sample = [
      entry('A', { tierPieces: 4 }),
      entry('B', { tierPieces: 2 }),
      entry('C', { qualified: false, tierPieces: 4 }),
    ];

    const view = describeCohort(subject, sample, { tierPieces: 4 });

    // `excluded` se compte sur le vivier entier, disqualifiés compris : c'est le nombre que
    // le chat annonce quand il dit ce que le filtre a coûté.
    expect(view).toMatchObject({ size: 1, excluded: 2 });
  });

  it('lists members from the closest to the furthest, with their distance', () => {
    const sample = [
      entry('Far', { stats: stats({ name: 'Far', avgIlvl: 648 }) }),
      entry('Near', { stats: stats({ name: 'Near', avgIlvl: 641 }) }),
    ];

    const view = describeCohort(subject, sample);

    expect(view.members.map((m) => m.name)).toEqual(['Near', 'Far']);
    expect(view.members[0].distance).toBeLessThan(view.members[1].distance);
    expect(view.members[0]).toMatchObject({ avgIlvl: 641, tierPieces: 2, qualified: true });
  });

  it('recomputes the comparability level on the filtered cohort, not on the original panel', () => {
    // Le vivier entier tient deux candidats très loin ; resserrer sur l'ilvl les sort, et le
    // niveau que le chat annonce doit bouger avec eux. C'est toute la réponse à « qu'est-ce
    // que ça change ».
    const sample = [
      entry('Near', { stats: stats({ name: 'Near', avgIlvl: 641 }) }),
      entry('Wild', { stats: stats({ name: 'Wild', avgIlvl: 680 }) }),
      entry('Wilder', { stats: stats({ name: 'Wilder', avgIlvl: 690 }) }),
    ];

    expect(describeCohort(subject, sample).level).toBe('poor');
    expect(describeCohort(subject, sample, { ilvlWithin: 2 }).level).toBe('close');
  });

  it('reports an empty cohort as empty instead of widening it back', () => {
    // `usableSample` rouvre la cohorte aux disqualifiés quand plus rien ne qualifie : c'est
    // le bon repli pour un panel choisi automatiquement, et l'inverse de ce qu'il faut ici.
    // Une demande explicite qui ne retient personne doit le dire.
    const sample = [entry('A', { tierPieces: 2 }), entry('B', { qualified: false, tierPieces: 4 })];

    const view = describeCohort(subject, sample, { tierPieces: 4 });

    expect(view).toMatchObject({
      size: 0,
      excluded: 2,
      level: 'none',
      medianDistance: null,
      stats: [],
      dps: null,
      killTimeMs: null,
      members: [],
    });
  });

  it('takes the median distance of the retained members', () => {
    const sample = [
      entry('A', { stats: stats({ name: 'A', avgIlvl: 640 }) }),
      entry('B', { stats: stats({ name: 'B', avgIlvl: 644 }) }),
      entry('C', { stats: stats({ name: 'C', avgIlvl: 648 }) }),
    ];

    // Kill times identiques à celui du sujet : la distance se réduit à l'écart d'ilvl divisé
    // par `ILVL_TOLERANCE`, soit 0, 1 et 2.
    expect(describeCohort(subject, sample).medianDistance).toBe(1);
  });

  it('describes stats, dps and kill time on the retained entries only', () => {
    const sample = [
      entry('Kept', {
        dps: 320000,
        killTimeMs: 190000,
        stats: stats({ name: 'Kept', crit: 5000 }),
      }),
      entry('Dropped', {
        qualified: false,
        dps: 900000,
        killTimeMs: 90000,
        stats: stats({ name: 'Dropped', crit: 99000 }),
      }),
    ];

    const view = describeCohort(subject, sample);

    expect(view.dps).toMatchObject({ mine: 280000, min: 320000, max: 320000, sampleSize: 1 });
    expect(view.killTimeMs).toMatchObject({ mine: 200000, median: 190000, sampleSize: 1 });
    expect(view.stats.find((s) => s.key === 'crit')).toMatchObject({ mine: 4000, max: 5000 });
  });

  it('echoes the filter it was given, so the answer can name its own cohort', () => {
    const filter = { tierPieces: 4, maxKillTimeMs: 300000 };

    expect(describeCohort(subject, [entry('A', { tierPieces: 4 })], filter).filter).toBe(filter);
  });
});
