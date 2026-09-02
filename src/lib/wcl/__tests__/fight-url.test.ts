import { describe, expect, it } from 'vitest';

import { fightUrl } from '../fight-url';

describe('fightUrl', () => {
  it('rend l’adresse publique du combat', () => {
    expect(fightUrl('aBcD1234efGH', 7)).toBe(
      'https://www.warcraftlogs.com/reports/aBcD1234efGH#fight=7'
    );
  });

  it('cible l’acteur quand il est connu', () => {
    expect(fightUrl('aBcD1234efGH', 7, 12)).toBe(
      'https://www.warcraftlogs.com/reports/aBcD1234efGH#fight=7&source=12'
    );
  });

  // `API_URL` sert le serveur, jamais un navigateur : le lien visible ne doit pas en venir.
  it('ne vise jamais l’API : le lien part du site public', () => {
    expect(fightUrl('aBcD1234efGH', 1)).not.toContain('/api/');
  });

  it('refuse un code qui n’est pas alphanumérique', () => {
    for (const code of ['abc/def', '../secret', 'abc?x=1', 'abc def', 'abc#1']) {
      expect(fightUrl(code, 1)).toBeNull();
    }
  });

  it('refuse un code absent ou vide', () => {
    expect(fightUrl(undefined, 1)).toBeNull();
    expect(fightUrl(null, 1)).toBeNull();
    expect(fightUrl('', 1)).toBeNull();
  });

  it('refuse un identifiant de combat qui n’en est pas un', () => {
    expect(fightUrl('abc', 0)).toBeNull();
    expect(fightUrl('abc', -3)).toBeNull();
    expect(fightUrl('abc', 1.5)).toBeNull();
    expect(fightUrl('abc', Number.NaN)).toBeNull();
    expect(fightUrl('abc', undefined)).toBeNull();
    expect(fightUrl('abc', null)).toBeNull();
  });

  it('laisse tomber un acteur aberrant sans emporter le lien', () => {
    const plain = 'https://www.warcraftlogs.com/reports/abc#fight=2';
    expect(fightUrl('abc', 2, 0)).toBe(plain);
    expect(fightUrl('abc', 2, -1)).toBe(plain);
    expect(fightUrl('abc', 2, null)).toBe(plain);
    expect(fightUrl('abc', 2, undefined)).toBe(plain);
  });
});
