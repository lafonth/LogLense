import { describe, expect, it } from 'vitest';
import {
  comparabilityLevel,
  levelWithPanelSize,
  matchPercent,
  medianOf,
  scoreCandidate,
  selectClosest,
} from '../comparability';
import { TOP_N } from '../constants';

const MY_ILVL = 284;
const MY_MS = 300000; // 5:00

describe('scoreCandidate', () => {
  it('is zero for a candidate identical to the player', () => {
    expect(scoreCandidate({ bracketData: 284, duration: 300000 }, MY_ILVL, MY_MS)).toBe(0);
  });

  it('is 1 when a single criterion sits exactly at its tolerance', () => {
    // 4 ilvl away, same kill time: 4/4 = 1 on one axis, 0 on the other
    expect(scoreCandidate({ bracketData: 288, duration: 300000 }, MY_ILVL, MY_MS)).toBe(1);
    // 20% slower, same ilvl: 0.2/0.2 = 1
    expect(scoreCandidate({ bracketData: 284, duration: 360000 }, MY_ILVL, MY_MS)).toBe(1);
  });

  it('treats a gap as equally bad in either direction', () => {
    const above = scoreCandidate({ bracketData: 288, duration: 300000 }, MY_ILVL, MY_MS);
    const below = scoreCandidate({ bracketData: 280, duration: 300000 }, MY_ILVL, MY_MS);
    expect(above).toBe(below);
  });

  it('combines the two axes so one good criterion does not excuse the other', () => {
    // at tolerance on both: sqrt(1 + 1)
    const both = scoreCandidate({ bracketData: 288, duration: 360000 }, MY_ILVL, MY_MS);
    expect(both).toBeCloseTo(Math.SQRT2, 5);
  });

  it('sorts a candidate with no ilvl after every scorable one', () => {
    expect(scoreCandidate({ duration: 300000 }, MY_ILVL, MY_MS)).toBe(Number.POSITIVE_INFINITY);
  });

  // A NaN would pass an undefined/null guard and then score NaN. The sort comparator
  // coerces NaN to +0, so the entry keeps its position and is picked first, unscored.
  it('sorts a candidate with a non-numeric ilvl or duration after every scorable one', () => {
    expect(scoreCandidate({ bracketData: Number.NaN, duration: 300000 }, MY_ILVL, MY_MS)).toBe(
      Number.POSITIVE_INFINITY
    );
    expect(scoreCandidate({ bracketData: 284, duration: Number.NaN }, MY_ILVL, MY_MS)).toBe(
      Number.POSITIVE_INFINITY
    );
  });

  it('does not let a non-numeric candidate outrank a scorable one', () => {
    const picked = selectClosest(
      [
        { name: 'nan', bracketData: 284, duration: Number.NaN },
        { name: 'ok', bracketData: 285, duration: 300000 },
      ],
      MY_ILVL,
      MY_MS,
      2
    );

    expect(picked.map((p) => p.candidate.name)).toEqual(['ok', 'nan']);
  });

  it('returns Infinity when the player has no item level', () => {
    expect(scoreCandidate({ bracketData: 284, duration: 300000 }, 0, MY_MS)).toBe(
      Number.POSITIVE_INFINITY
    );
  });

  it('treats the kill-time gap as zero rather than dividing by zero', () => {
    expect(scoreCandidate({ bracketData: 284, duration: 5000 }, MY_ILVL, 0)).toBe(0);
  });
});

describe('selectClosest', () => {
  const candidates = [
    { name: 'far-strong', bracketData: 296, duration: 200000 },
    { name: 'near', bracketData: 285, duration: 310000 },
    { name: 'mid', bracketData: 290, duration: 330000 },
    { name: 'no-ilvl', duration: 300000 },
  ];

  it('returns the closest candidates, not the fastest ones', () => {
    const picked = selectClosest(candidates, MY_ILVL, MY_MS, 2);
    expect(picked.map((p) => p.candidate.name)).toEqual(['near', 'mid']);
  });

  it('keeps an unscorable candidate last rather than dropping it', () => {
    const picked = selectClosest(candidates, MY_ILVL, MY_MS, 4);
    expect(picked[3].candidate.name).toBe('no-ilvl');
    expect(picked[3].distance).toBe(Number.POSITIVE_INFINITY);
  });

  it('returns an empty list for an empty pool', () => {
    expect(selectClosest([], MY_ILVL, MY_MS, 3)).toEqual([]);
  });

  it('attaches the distance it sorted on', () => {
    const [first] = selectClosest(candidates, MY_ILVL, MY_MS, 1);
    expect(first.distance).toBeCloseTo(
      scoreCandidate({ bracketData: 285, duration: 310000 }, MY_ILVL, MY_MS),
      5
    );
  });
});

describe('comparabilityLevel', () => {
  const at = (distance: number) => ({ candidate: null, distance });

  it('is none for an empty selection', () => {
    expect(comparabilityLevel([])).toBe('none');
  });

  it('is close at a median distance of exactly 1', () => {
    expect(comparabilityLevel([at(0.5), at(1), at(1)])).toBe('close');
  });

  it('is approximate at a median distance of exactly 2', () => {
    expect(comparabilityLevel([at(1.5), at(2), at(2)])).toBe('approximate');
  });

  it('is poor beyond 2', () => {
    expect(comparabilityLevel([at(3), at(4), at(5)])).toBe('poor');
  });

  it('is poor when every candidate is unscorable', () => {
    expect(comparabilityLevel([at(Number.POSITIVE_INFINITY)])).toBe('poor');
  });

  it('is poor, not close, when the player has no item level', () => {
    const candidates = [
      { name: 'near', bracketData: 285, duration: 310000 },
      { name: 'mid', bracketData: 290, duration: 330000 },
    ];
    const scored = selectClosest(candidates, 0, MY_MS, candidates.length);
    expect(comparabilityLevel(scored)).toBe('poor');
  });
});

describe('levelWithPanelSize', () => {
  // Le point de sortie de l'étape 6 : les filtres à la source peuvent vider le vivier, et un
  // panel réduit sous `TOP_N` ne doit jamais passer sans que le niveau le dise.
  it('refuses to call a panel shorter than TOP_N better than poor', () => {
    expect(levelWithPanelSize('close', TOP_N - 1, TOP_N)).toBe('poor');
    expect(levelWithPanelSize('approximate', 1, TOP_N)).toBe('poor');
  });

  // Ce n'est pas une pénalité, c'est ce que la mesure vaut : `comparabilityLevel` tranche sur
  // une médiane, choisie pour sa robustesse — laquelle n'existe pas à une ou deux valeurs.
  it('leaves a full panel exactly where the distances put it', () => {
    expect(levelWithPanelSize('close', TOP_N, TOP_N)).toBe('close');
    expect(levelWithPanelSize('approximate', TOP_N + 2, TOP_N)).toBe('approximate');
    expect(levelWithPanelSize('poor', TOP_N, TOP_N)).toBe('poor');
  });

  it('stays none for an empty panel, whichever end it came from', () => {
    expect(levelWithPanelSize('none', 0, TOP_N)).toBe('none');
    expect(levelWithPanelSize('close', 0, TOP_N)).toBe('none');
    expect(levelWithPanelSize('none', TOP_N, TOP_N)).toBe('none');
  });
});

describe('medianOf', () => {
  it('averages the two middle values for an even count', () => {
    expect(medianOf([1, 2, 3, 4])).toBe(2.5);
  });

  it('returns the middle value for an odd count', () => {
    expect(medianOf([3, 1, 2])).toBe(2);
  });

  it('returns null for an empty list', () => {
    expect(medianOf([])).toBeNull();
  });
});

describe('matchPercent', () => {
  it('is 100% for a candidate identical to the player', () => {
    expect(matchPercent(0)).toBe(100);
  });

  // Les deux ancres documentées de l'échelle : ce sont les seuils sur lesquels
  // `comparabilityLevel` tranche déjà, donc les deux lectures ne peuvent pas diverger.
  it('lands on the two thresholds the comparability level rules on', () => {
    expect(matchPercent(1)).toBe(75);
    expect(matchPercent(2)).toBe(50);
  });

  it('agrees with the level of a panel whose references all sit at the same distance', () => {
    const panel = (d: number) => [{ candidate: null, distance: d }];

    expect(comparabilityLevel(panel(1))).toBe('close');
    expect(matchPercent(1)).toBeGreaterThanOrEqual(75);

    expect(comparabilityLevel(panel(2))).toBe('approximate');
    expect(matchPercent(2)).toBeGreaterThanOrEqual(50);

    expect(comparabilityLevel(panel(2.5))).toBe('poor');
    expect(matchPercent(2.5)).toBeLessThan(50);
  });

  // La jointure entre la droite et la queue : même valeur et même pente, sinon le chiffre
  // sauterait sur deux candidats que la sélection considère quasi identiques.
  it('does not jump at the seam between the linear stretch and the tail', () => {
    expect(matchPercent(1.99)).toBe(50); // 50.25, arrondi
    expect(matchPercent(2.01)).toBe(50); // 49.75, arrondi
  });

  it('decreases without ever reaching zero on a scored candidate', () => {
    expect(matchPercent(4)).toBe(25);
    expect(matchPercent(10)).toBe(10);
    expect(matchPercent(10000)).toBe(1);
  });

  it('never reads higher for a farther candidate', () => {
    const steps = [0, 0.3, 0.9, 1, 1.5, 2, 2.7, 5, 20, 500];
    const percents = steps.map(matchPercent);
    for (let i = 1; i < percents.length; i++) {
      expect(percents[i]!).toBeLessThanOrEqual(percents[i - 1]!);
    }
  });

  // Non scoré et scoré très loin sont deux états différents : le premier n'a pas de chiffre,
  // le second en a un mauvais. Les confondre à l'écran ferait passer une absence pour un zéro.
  it('has no percentage at all for an unscorable candidate', () => {
    expect(matchPercent(Number.POSITIVE_INFINITY)).toBeNull();
    expect(matchPercent(Number.NaN)).toBeNull();
  });
});
