import { describe, expect, it } from 'vitest';
import { bracketOf, bracketsCovering, itemLevelBrackets } from '../brackets';
import { ILVL_TOLERANCE, MAX_POOL_BRACKETS } from '../constants';

/** Le découpage relevé sur le palier courant au spike de l'étape 3, `docs/07-spike-rankings.md`. */
const TIER = { min: 272, max: 344, bucket: 3 };

describe('itemLevelBrackets', () => {
  it('accepts the bracketing Warcraft Logs declares on item level', () => {
    expect(itemLevelBrackets({ type: 'Item Level', ...TIER })).toEqual(TIER);
  });

  // Un `type` inattendu n'est pas un détail : filtrer sur un axe qu'on prend pour l'ilvl
  // écarterait le vivier au hasard, et rien à l'écran ne le dirait.
  it('refuses a bracketing on any other axis, and an absent one', () => {
    expect(itemLevelBrackets({ type: 'Boss Percentage', ...TIER })).toBeNull();
    expect(itemLevelBrackets(null)).toBeNull();
    expect(itemLevelBrackets(undefined)).toBeNull();
    expect(itemLevelBrackets({ type: 'Item Level' })).toBeNull();
  });

  it('refuses an incoherent bracketing rather than dividing by it', () => {
    expect(itemLevelBrackets({ type: 'Item Level', ...TIER, bucket: 0 })).toBeNull();
    expect(itemLevelBrackets({ type: 'Item Level', ...TIER, bucket: -3 })).toBeNull();
    expect(itemLevelBrackets({ type: 'Item Level', min: 344, max: 272, bucket: 3 })).toBeNull();
  });
});

describe('bracketOf', () => {
  // La formule est mesurée, pas déduite : le bracket `n` couvre
  // `[min + (n−1)·bucket , min + n·bucket − 1]`, et la numérotation part de 1.
  it('places the floor of the tier in the first bracket, with the two ilvls above it', () => {
    expect(bracketOf(272, TIER)).toBe(1);
    expect(bracketOf(273, TIER)).toBe(1);
    expect(bracketOf(274, TIER)).toBe(1);
    expect(bracketOf(275, TIER)).toBe(2);
  });

  it('never returns 0, which is the value WCL reserves for the unfiltered pool', () => {
    expect(bracketOf(TIER.min, TIER)).toBeGreaterThan(0);
    expect(bracketOf(TIER.max, TIER)).toBe(25);
  });
});

describe('bracketsCovering', () => {
  // Le point qui compte : le filtre ne doit jamais écarter un candidat que `scoreCandidate`
  // aurait accepté. Un bracket fait 3 ilvl, la tolérance 4 — donc il en faut plusieurs, et la
  // couverture doit déborder de part et d'autre.
  it('covers the whole ilvl tolerance around the player, on both sides', () => {
    const covered = bracketsCovering(320, TIER);

    expect(covered).toEqual([15, 16, 17, 18]);
    expect(covered).toContain(bracketOf(320 - ILVL_TOLERANCE, TIER));
    expect(covered).toContain(bracketOf(320 + ILVL_TOLERANCE, TIER));
    expect(covered).toContain(bracketOf(320, TIER));
  });

  // Ce qui garde le cache payant : deux joueurs voisins ne demandent pas la même fenêtre,
  // mais ils demandent très largement les mêmes tranches — d'où une clé de cache par bracket.
  it('overlaps the window of a neighbouring player rather than replacing it', () => {
    const mine = bracketsCovering(320, TIER);
    const theirs = bracketsCovering(322, TIER);

    expect(theirs).not.toEqual(mine);
    expect(theirs.filter((b) => mine.includes(b))).toEqual([16, 17, 18]);
  });

  it('is a contiguous run, never a set with a hole in it', () => {
    const covered = bracketsCovering(310, TIER);
    expect(covered.every((b, i) => i === 0 || b === covered[i - 1] + 1)).toBe(true);
  });

  it('clamps at the floor and the ceiling of the tier instead of asking for bracket 0', () => {
    expect(bracketsCovering(TIER.min, TIER)).toEqual([1, 2]);
    expect(bracketsCovering(TIER.max, TIER).at(-1)).toBe(25);
    expect(bracketsCovering(TIER.min, TIER).every((b) => b >= 1)).toBe(true);
  });

  // Renoncer au filtre entier, et non rogner la couverture : rogner reviendrait à écarter en
  // silence une partie de la tolérance. `[]` veut dire « demande le vivier non filtré ».
  it('gives up the filter when covering the tolerance would cost too many brackets', () => {
    const fine = { min: 272, max: 344, bucket: 1 };

    expect(bracketsCovering(320, fine)).toEqual([]);
    expect(bracketsCovering(320, TIER).length).toBeLessThanOrEqual(MAX_POOL_BRACKETS);
  });

  it('gives up the filter when the player ilvl is unknown', () => {
    expect(bracketsCovering(0, TIER)).toEqual([]);
    expect(bracketsCovering(Number.NaN, TIER)).toEqual([]);
  });
});
