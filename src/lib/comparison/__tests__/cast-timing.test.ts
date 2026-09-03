import type { CastTimeline, RotationSummary, TopPlayer } from '@/types';
import { describe, expect, it } from 'vitest';
import { castTimings } from '../cast-timing';

const GUIDS: Record<string, number> = { Combustion: 190319, Fireball: 133, Shield: 11426 };

const timeline = (casts: [string, number][], truncated = false): CastTimeline => ({
  casts: casts.map(([name, s]) => ({ guid: GUIDS[name] ?? 0, name, offsetMs: s * 1000 })),
  truncated,
});

/** `perMin` est ce qui sépare un cooldown d'un remplissage : il est donné, jamais déduit. */
const rotation = (rates: Record<string, number>, tl?: CastTimeline): RotationSummary =>
  ({
    casts: Object.fromEntries(
      Object.entries(rates).map(([name, perMin]) => [name, { guid: GUIDS[name], casts: 1, perMin }])
    ),
    timeline: tl,
  }) as unknown as RotationSummary;

const subject = (
  rates: Record<string, number>,
  tl: CastTimeline | undefined,
  damaging: string[]
) => ({
  rotation: rotation(rates, tl),
  damageTable: { entries: damaging.map((name) => ({ guid: GUIDS[name], name, total: 1 })) },
});

const reference = (tl: CastTimeline): TopPlayer =>
  ({ rotation: { timeline: tl } }) as unknown as TopPlayer;

const cd = { Combustion: 0.5 };

describe('castTimings', () => {
  it('names the first use that falls outside the field range, with its deviation', () => {
    const result = castTimings(
      subject(
        cd,
        timeline([
          ['Combustion', 0],
          ['Combustion', 150],
        ]),
        ['Combustion']
      ),
      [
        reference(
          timeline([
            ['Combustion', 0],
            ['Combustion', 120],
          ])
        ),
        reference(
          timeline([
            ['Combustion', 2],
            ['Combustion', 125],
          ])
        ),
      ]
    );

    expect(result.silenced).toBeNull();
    expect(result.comparedTotal).toBe(1);
    expect(result.abilities).toHaveLength(1);
    expect(result.abilities[0].firstOutsideRank).toBe(2);
    // Franchi la borne haute du champ (125 s) de 25 s, pas la médiane.
    expect(result.abilities[0].deviationMs).toBe(25_000);
  });

  it('stays silent while the deviation is under the noise floor', () => {
    // 128 s contre une fourchette 120–125 : trois secondes au-delà du plus lent, ce n'est
    // pas une décision de jeu.
    const result = castTimings(
      subject(
        cd,
        timeline([
          ['Combustion', 0],
          ['Combustion', 128],
        ]),
        ['Combustion']
      ),
      [
        reference(
          timeline([
            ['Combustion', 0],
            ['Combustion', 120],
          ])
        ),
        reference(
          timeline([
            ['Combustion', 0],
            ['Combustion', 125],
          ])
        ),
      ]
    );

    expect(result.abilities).toHaveLength(0);
    expect(result.comparedTotal).toBe(1);
  });

  it('reports a use I never reached as an absence, without a number', () => {
    const result = castTimings(subject(cd, timeline([['Combustion', 0]]), ['Combustion']), [
      reference(
        timeline([
          ['Combustion', 0],
          ['Combustion', 120],
        ])
      ),
      reference(
        timeline([
          ['Combustion', 0],
          ['Combustion', 125],
        ])
      ),
    ]);

    expect(result.abilities[0].firstOutsideRank).toBe(2);
    expect(result.abilities[0].deviationMs).toBeNull();
    expect(result.abilities[0].ranks[1].mineMs).toBeNull();
  });

  it('ignores an ability that is not a damage source, whatever its rate', () => {
    // Le seul garde-fou de périmètre sans métadonnée de spec : absent de la table de dégâts,
    // le sort ne peut pas être distingué d'une défensive.
    const result = castTimings(
      subject(
        { Shield: 0.5 },
        timeline([
          ['Shield', 0],
          ['Shield', 200],
        ]),
        ['Combustion']
      ),
      [
        reference(
          timeline([
            ['Shield', 0],
            ['Shield', 60],
          ])
        ),
        reference(
          timeline([
            ['Shield', 0],
            ['Shield', 62],
          ])
        ),
      ]
    );

    expect(result.comparedTotal).toBe(0);
    expect(result.abilities).toHaveLength(0);
  });

  it('ignores a filler: its instant is decided by what came before it, not by a plan', () => {
    const result = castTimings(
      subject(
        { Fireball: 30 },
        timeline([
          ['Fireball', 0],
          ['Fireball', 90],
        ]),
        ['Fireball']
      ),
      [
        reference(
          timeline([
            ['Fireball', 0],
            ['Fireball', 3],
          ])
        ),
        reference(
          timeline([
            ['Fireball', 0],
            ['Fireball', 4],
          ])
        ),
      ]
    );

    expect(result.comparedTotal).toBe(0);
  });

  it('says nothing at all when my chain is truncated', () => {
    const result = castTimings(
      subject(
        cd,
        timeline(
          [
            ['Combustion', 0],
            ['Combustion', 150],
          ],
          true
        ),
        ['Combustion']
      ),
      [
        reference(
          timeline([
            ['Combustion', 0],
            ['Combustion', 120],
          ])
        ),
        reference(
          timeline([
            ['Combustion', 0],
            ['Combustion', 125],
          ])
        ),
      ]
    );

    expect(result.silenced).toBe('truncated');
    expect(result.abilities).toHaveLength(0);
  });

  it('says nothing when a snapshot carries no chain at all', () => {
    const result = castTimings(subject(cd, undefined, ['Combustion']), [
      reference(timeline([['Combustion', 0]])),
      reference(timeline([['Combustion', 0]])),
    ]);

    expect(result.silenced).toBe('no-timeline');
  });

  it('refuses a range built on a single reference', () => {
    // Une référence n'est pas une fourchette, c'est un exemple — et la seconde est tronquée.
    const result = castTimings(
      subject(
        cd,
        timeline([
          ['Combustion', 0],
          ['Combustion', 150],
        ]),
        ['Combustion']
      ),
      [
        reference(
          timeline([
            ['Combustion', 0],
            ['Combustion', 120],
          ])
        ),
        reference(
          timeline(
            [
              ['Combustion', 0],
              ['Combustion', 120],
            ],
            true
          )
        ),
      ]
    );

    expect(result.silenced).toBe('not-enough-references');
    expect(result.abilities).toHaveLength(0);
  });

  it('stops at the deepest rank two references share', () => {
    const result = castTimings(
      subject(
        cd,
        timeline([
          ['Combustion', 0],
          ['Combustion', 150],
          ['Combustion', 300],
        ]),
        ['Combustion']
      ),
      [
        reference(
          timeline([
            ['Combustion', 0],
            ['Combustion', 60],
            ['Combustion', 118],
          ])
        ),
        reference(
          timeline([
            ['Combustion', 0],
            ['Combustion', 62],
          ])
        ),
      ]
    );

    // Le troisième rang n'a qu'une référence : il n'existe pas, donc mon 300 s n'est
    // comparé à rien — deux rangs rendus, pas trois.
    expect(result.abilities[0].ranks).toHaveLength(2);
    expect(result.abilities[0].firstOutsideRank).toBe(2);
  });

  it('puts a missing use ahead of any measured lateness', () => {
    const result = castTimings(
      subject(
        { Combustion: 0.5, Fireball: 0.5 },
        timeline([
          ['Combustion', 0],
          ['Fireball', 0],
          ['Fireball', 200],
        ]),
        ['Combustion', 'Fireball']
      ),
      [
        reference(
          timeline([
            ['Combustion', 0],
            ['Combustion', 120],
            ['Fireball', 0],
            ['Fireball', 120],
          ])
        ),
        reference(
          timeline([
            ['Combustion', 0],
            ['Combustion', 122],
            ['Fireball', 0],
            ['Fireball', 122],
          ])
        ),
      ]
    );

    expect(result.abilities.map((a) => a.name)).toEqual(['Combustion', 'Fireball']);
    expect(result.abilities[0].deviationMs).toBeNull();
  });
});
