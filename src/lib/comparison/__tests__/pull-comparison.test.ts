import type { PullSnapshot } from '../pull-comparison';
import { describe, expect, it } from 'vitest';
import { comparePulls, decomposePullDelta } from '../pull-comparison';

function pull(overrides: Partial<PullSnapshot> = {}): PullSnapshot {
  return {
    code: 'AbCdEfGhIjKlMnOp',
    fightId: 1,
    actorId: 1,
    name: 'Testeur',
    fightMs: 300_000,
    stats: {
      name: 'Testeur',
      avgIlvl: 639,
      primaryStat: 10_000,
      crit: 30,
      haste: 20,
      mastery: 25,
      vers: 10,
      talents: { 1: 1, 2: 1 },
    },
    rotation: { name: 'Testeur', fightDurationMs: 300_000, casts: {}, buffs: {}, opening: [] },
    damageEntries: [],
    dps: 100_000,
    eligibility: { tierPieces: 2, externalUptime: 0, externals: [] },
    context: null,
    ...overrides,
  };
}

describe('decomposePullDelta', () => {
  it('rend un écart nul sur chaque axe pour deux pulls identiques', () => {
    const before = pull();
    const after = pull();

    expect(decomposePullDelta(before, after)).toEqual({
      dpsDelta: 0,
      ilvlPart: 0,
      killTimePart: 0,
      remainder: 0,
    });
  });

  it('attribue au kill time un écart qui ne vient que de la durée du combat', () => {
    const before = pull({ fightMs: 300_000, dps: 100_000 });
    // 10 % plus court, DPS ajusté exactement de l'élasticité déclarée : le reste doit être nul.
    const after = pull({ fightMs: 270_000, dps: 101_500 });

    const delta = decomposePullDelta(before, after);

    expect(delta.killTimePart).toBe(1_500);
    expect(delta.ilvlPart).toBe(0);
    expect(delta.remainder).toBe(0);
  });

  it('attribue au matériel un écart qui ne vient que de l’ilvl', () => {
    const before = pull({ dps: 100_000 });
    // +10 ilvl à 1 % par point sur un DPS de 100 000 : 10 000 de plus, sans rien d'autre.
    const after = pull({ dps: 110_000, stats: { ...before.stats, avgIlvl: 649 } });

    const delta = decomposePullDelta(before, after);

    expect(delta.ilvlPart).toBe(10_000);
    expect(delta.killTimePart).toBe(0);
    expect(delta.remainder).toBe(0);
  });
});

describe('comparePulls', () => {
  it("ne signale aucune disqualification quand aucune pull n'a été plus aidée que l'autre", () => {
    const before = pull();
    const after = pull();

    const result = comparePulls(before, after, 999);

    expect(result.disqualifiedAfter).toEqual([]);
    expect(result.disqualifiedBefore).toEqual([]);
  });

  it('signale un external reçu sur la seconde pull sans le compter comme progrès', () => {
    const before = pull({ eligibility: { tierPieces: 2, externalUptime: 0, externals: [] } });
    const after = pull({
      dps: 130_000,
      eligibility: { tierPieces: 2, externalUptime: 40, externals: ['Power Infusion'] },
    });

    const result = comparePulls(before, after, 999);

    expect(result.disqualifiedAfter).toEqual(['external']);
    expect(result.disqualifiedBefore).toEqual([]);
    // La disqualification est un signal séparé : le delta brut reste chiffré tel quel.
    expect(result.delta.dpsDelta).toBe(30_000);
  });

  it('retombe sur un TalentNode vide pour une spec inconnue plutôt que de jeter', () => {
    const before = pull();
    const after = pull();

    expect(() => comparePulls(before, after, -1)).not.toThrow();
  });
});
