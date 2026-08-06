import { describe, expect, it } from 'vitest';
import { findParseInRanks, toServerSlug } from '../historical-parse';

function rank(code: string, fightID: number, over: Record<string, unknown> = {}) {
  return { report: { code, fightID }, rankPercent: 60.92, rankTotalParses: 353, ...over };
}

describe('toServerSlug', () => {
  it('met le nom en minuscules', () => {
    expect(toServerSlug('Ysondre')).toBe('ysondre');
  });

  it('remplace les espaces par des tirets', () => {
    expect(toServerSlug('Kirin Tor')).toBe('kirin-tor');
  });

  it('supprime les apostrophes, droites comme typographiques', () => {
    expect(toServerSlug("Cho'gall")).toBe('chogall');
    expect(toServerSlug('Cho’gall')).toBe('chogall');
  });
});

describe('findParseInRanks', () => {
  const payload = {
    ranks: [rank('AAA', 12), rank('BBB', 37, { rankPercent: 81.1, rankTotalParses: 420 })],
  };

  it('rend le parse du combat demandé', () => {
    expect(findParseInRanks(payload, 'BBB', 37)).toEqual({
      rankPercent: 81.1,
      rankTotalParses: 420,
      todayPercent: null,
    });
  });

  it('exige le code ET le fightID, pas seulement le rapport', () => {
    expect(findParseInRanks(payload, 'BBB', 12)).toBeNull();
  });

  it("rend null quand le personnage n'a pas ce combat classé", () => {
    expect(findParseInRanks(payload, 'ZZZ', 1)).toBeNull();
  });

  it('remonte le percentile du jour quand WCL le donne', () => {
    const withToday = { ranks: [rank('AAA', 12, { todayPercent: 55.38 })] };
    expect(findParseInRanks(withToday, 'AAA', 12)?.todayPercent).toBe(55.38);
  });

  it('rend null sur une réponse vide ou malformée', () => {
    expect(findParseInRanks(null, 'AAA', 1)).toBeNull();
    expect(findParseInRanks({}, 'AAA', 1)).toBeNull();
    expect(findParseInRanks({ ranks: 'nope' }, 'AAA', 1)).toBeNull();
  });

  it('refuse un parse sans percentile plutôt que de rendre NaN', () => {
    const noPct = { ranks: [{ report: { code: 'AAA', fightID: 1 } }] };
    expect(findParseInRanks(noPct, 'AAA', 1)).toBeNull();
  });
});
