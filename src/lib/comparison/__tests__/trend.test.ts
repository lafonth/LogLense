import type { TrajectoryPoint } from '@/lib/wcl/trajectory';
import { describe, expect, it } from 'vitest';
import { analyseTrend, decomposeStep, segmentBySpec } from '../trend';

let n = 0;

function point(over: Partial<TrajectoryPoint> = {}): TrajectoryPoint {
  n += 1;
  return {
    at: new Date(Date.UTC(2026, 3, n, 20)).toISOString(),
    dps: 100000,
    rankPercent: 60,
    todayPercent: 55,
    bracket: 280,
    killTimeMs: 300000,
    code: `R${n}`,
    fightID: 1,
    spec: 'Feral',
    analysed: false,
    ...over,
  };
}

describe('decomposeStep', () => {
  it("attribue à l'ilvl ce que l'ilvl explique, et rend le reste", () => {
    const step = decomposeStep(point(), point({ dps: 105000, bracket: 284 }));

    // 4 ilvl × 1 % × 100 000 = 4 000 de matériel ; il reste 1 000 pour le joueur.
    expect(step).toMatchObject({
      dpsDelta: 5000,
      ilvlPart: 4000,
      killTimePart: 0,
      remainder: 1000,
    });
  });

  it('attribue au kill time ce que le kill time explique', () => {
    const step = decomposeStep(point(), point({ dps: 103000, killTimeMs: 270000 }));

    // 10 % de combat en moins × 0,15 × 100 000 = 1 500 ; il reste 1 500.
    expect(step).toMatchObject({
      dpsDelta: 3000,
      ilvlPart: 0,
      killTimePart: 1500,
      remainder: 1500,
    });
  });

  // Le cas que l'écran doit rendre lisible : la courbe monte, le joueur n'a rien changé.
  it('rend un reste nul quand tout le gain vient du contexte', () => {
    // 4 000 de matériel, 750 de combat plus court : le gain les couvre exactement.
    const step = decomposeStep(point(), point({ dps: 104750, bracket: 284, killTimeMs: 285000 }));

    expect(step).toMatchObject({ ilvlPart: 4000, killTimePart: 750 });
    expect(step.remainder).toBe(0);
  });

  it('compte un combat plus long contre le joueur, pas pour lui', () => {
    const step = decomposeStep(point(), point({ dps: 100000, killTimeMs: 330000 }));

    expect(step.killTimePart).toBe(-1500);
    expect(step.remainder).toBe(1500);
  });

  it("verse dans le reste ce qu'aucun champ absent ne permet d'attribuer", () => {
    const step = decomposeStep(
      point({ bracket: null, killTimeMs: 0 }),
      point({ dps: 108000, bracket: null, killTimeMs: 0 })
    );

    expect(step).toMatchObject({ ilvlPart: 0, killTimePart: 0, remainder: 8000 });
  });

  it("porte l'écart de percentile, qui ne dépend d'aucun coefficient", () => {
    const step = decomposeStep(point({ rankPercent: 60.9 }), point({ rankPercent: 72.4 }));

    expect(step.percentileDelta).toBe(11.5);
  });
});

describe('segmentBySpec', () => {
  it('coupe au changement de spec', () => {
    const segments = segmentBySpec([
      point({ spec: 'Feral' }),
      point({ spec: 'Feral' }),
      point({ spec: 'Balance' }),
    ]);

    expect(segments.map((s) => s.length)).toEqual([2, 1]);
  });

  it('prolonge le segment courant quand la spec est inconnue', () => {
    const segments = segmentBySpec([point({ spec: 'Feral' }), point({ spec: null })]);

    expect(segments).toHaveLength(1);
  });

  it('rend une liste vide sur une trajectoire vide', () => {
    expect(segmentBySpec([])).toEqual([]);
  });
});

describe('analyseTrend', () => {
  const withPercents = (percents: number[], over: Partial<TrajectoryPoint> = {}) =>
    percents.map((rankPercent) => point({ rankPercent, ...over }));

  it('appelle plateau une suite de kills qui ne monte plus', () => {
    const trend = analyseTrend(withPercents([61, 59, 62, 60, 61]));

    expect(trend.verdict).toBe('plateau');
    expect(Math.abs(trend.percentileSlope)).toBeLessThanOrEqual(1);
    expect(trend.percentileSpread).toBe(3);
  });

  it('appelle progression une pente franche', () => {
    const trend = analyseTrend(withPercents([40, 48, 55, 63, 71]));

    expect(trend.verdict).toBe('improving');
    expect(trend.percentileSlope).toBeGreaterThan(1);
  });

  it('appelle recul une pente franche vers le bas', () => {
    expect(analyseTrend(withPercents([71, 63, 55, 48, 40])).verdict).toBe('declining');
  });

  it('ne tranche pas sous trois kills', () => {
    const trend = analyseTrend(withPercents([40, 71]));

    expect(trend.verdict).toBe('insufficient');
    expect(trend.percentileSlope).toBe(0);
    expect(trend.steps).toHaveLength(1);
  });

  it('rend un verdict indécidable sur une trajectoire vide', () => {
    expect(analyseTrend([]).verdict).toBe('insufficient');
  });

  // Une progression en Balance ne dit rien du Feral joué ce soir.
  it('ne lit que le dernier segment de spec, et dit combien de kills il laisse dehors', () => {
    const trend = analyseTrend([
      ...withPercents([10, 20], { spec: 'Balance' }),
      ...withPercents([60, 61, 62], { spec: 'Feral' }),
    ]);

    expect(trend.points).toHaveLength(3);
    expect(trend.droppedForSpecChange).toBe(2);
    expect(trend.spec).toBe('Feral');
    expect(trend.verdict).toBe('plateau');
  });

  it('ne remonte pas au-delà des six derniers kills', () => {
    const trend = analyseTrend(withPercents([90, 90, 40, 42, 44, 46, 48, 50]));

    expect(trend.points).toHaveLength(6);
    expect(trend.points[0].rankPercent).toBe(40);
    expect(trend.verdict).toBe('improving');
  });

  it('somme les restes de la fenêtre : le gain qui parle du joueur', () => {
    const trend = analyseTrend([
      point({ dps: 100000 }),
      point({ dps: 104000, bracket: 284 }),
      point({ dps: 106000, bracket: 284 }),
    ]);

    // Premier pas : 4 000 de matériel, reste 0. Second : rien d'expliqué, reste 2 000.
    expect(trend.steps.map((s) => s.remainder)).toEqual([0, 2000]);
    expect(trend.remainderTotal).toBe(2000);
  });
});
