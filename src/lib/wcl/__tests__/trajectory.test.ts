import { describe, expect, it } from 'vitest';
import { parseTrajectory } from '../trajectory';

function rank(iso: string, over: Record<string, unknown> = {}) {
  return {
    startTime: Date.parse(iso),
    duration: 317924,
    amount: 105538.4,
    bracketData: 281,
    rankPercent: 60.92,
    todayPercent: 55.04,
    spec: 'Feral',
    report: { code: 'AAA', fightID: 12, startTime: Date.parse(iso) - 3 * 3600 * 1000 },
    ...over,
  };
}

describe('parseTrajectory', () => {
  it("rend un point par kill, avec ce qui sert à lire l'écart", () => {
    const [p] = parseTrajectory({ ranks: [rank('2026-04-22T20:11:00.000Z')] });

    expect(p).toEqual({
      at: '2026-04-22T20:11:00.000Z',
      dps: 105538,
      rankPercent: 60.9,
      todayPercent: 55,
      bracket: 281,
      killTimeMs: 317924,
      code: 'AAA',
      fightID: 12,
      spec: 'Feral',
      analysed: false,
    });
  });

  // L'ordre observé sur un cas réel : 22/04, 13/05, 06/05, 29/04, 09/04.
  it("trie du plus ancien au plus récent, parce que la source n'est pas triée", () => {
    const points = parseTrajectory({
      ranks: [
        rank('2026-04-22T20:00:00.000Z', { report: { code: 'A', fightID: 1 } }),
        rank('2026-05-13T20:00:00.000Z', { report: { code: 'B', fightID: 2 } }),
        rank('2026-04-09T20:00:00.000Z', { report: { code: 'C', fightID: 3 } }),
      ],
    });

    expect(points.map((p) => p.code)).toEqual(['C', 'A', 'B']);
  });

  // `report.startTime` date l'ouverture du log, plusieurs heures avant le kill.
  it("date le point sur le kill, pas sur l'ouverture du rapport", () => {
    const [p] = parseTrajectory({ ranks: [rank('2026-04-22T23:30:00.000Z')] });

    expect(p.at).toBe('2026-04-22T23:30:00.000Z');
  });

  it('dédoublonne sur code:fightID, la seule identité du combat', () => {
    const points = parseTrajectory({
      ranks: [rank('2026-04-22T20:00:00.000Z'), rank('2026-04-22T20:00:00.000Z')],
    });

    expect(points).toHaveLength(1);
  });

  it('marque le combat analysé, et lui seul', () => {
    const points = parseTrajectory(
      {
        ranks: [
          rank('2026-04-22T20:00:00.000Z', { report: { code: 'A', fightID: 1 } }),
          rank('2026-05-13T20:00:00.000Z', { report: { code: 'A', fightID: 2 } }),
        ],
      },
      { code: 'A', fightID: 2 }
    );

    expect(points.map((p) => p.analysed)).toEqual([false, true]);
  });

  // Le fightID fait partie de l'identité : un rapport porte souvent plusieurs kills.
  it("ne marque rien quand le combat analysé n'est pas dans la liste", () => {
    const points = parseTrajectory(
      { ranks: [rank('2026-04-22T20:00:00.000Z')] },
      {
        code: 'AAA',
        fightID: 99,
      }
    );

    expect(points.every((p) => !p.analysed)).toBe(true);
  });

  it('écarte une entrée sans date, sans DPS, sans percentile ou sans combat', () => {
    const points = parseTrajectory({
      ranks: [
        rank('2026-04-22T20:00:00.000Z', { startTime: undefined }),
        rank('2026-04-23T20:00:00.000Z', { amount: undefined }),
        rank('2026-04-24T20:00:00.000Z', { rankPercent: undefined }),
        rank('2026-04-25T20:00:00.000Z', { report: undefined }),
        rank('2026-04-26T20:00:00.000Z', { report: { code: 'AAA' } }),
      ],
    });

    expect(points).toEqual([]);
  });

  it('tolère les champs de confort absents', () => {
    const [p] = parseTrajectory({
      ranks: [
        rank('2026-04-22T20:00:00.000Z', {
          bracketData: undefined,
          todayPercent: undefined,
          duration: undefined,
          spec: undefined,
        }),
      ],
    });

    expect(p).toMatchObject({ bracket: null, todayPercent: null, killTimeMs: 0, spec: null });
  });

  // `guild { id, name, faction }` existe dans la source. C'est un nom de tiers.
  it("ne reprend pas la guilde de l'entrée", () => {
    const [p] = parseTrajectory({
      ranks: [rank('2026-04-22T20:00:00.000Z', { guild: { id: 1, name: 'Méduse', faction: 1 } })],
    });

    expect(JSON.stringify(p)).not.toContain('Méduse');
  });

  it('rend une liste vide quand la charge utile ne porte pas de rangs', () => {
    expect(parseTrajectory(null)).toEqual([]);
    expect(parseTrajectory({})).toEqual([]);
    expect(parseTrajectory({ ranks: 'none' })).toEqual([]);
  });
});
