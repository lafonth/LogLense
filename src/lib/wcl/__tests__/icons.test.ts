import { describe, expect, it } from 'vitest';
import { abilityIconUrl, mergeIcons } from '../icons';
import { collectIcons } from '../parsers';

describe('abilityIconUrl', () => {
  it('builds the asset URL from a bare file name', () => {
    expect(abilityIconUrl('ability_mage_arcanesurge.jpg')).toBe(
      'https://assets.rpglogs.com/img/warcraft/abilities/ability_mage_arcanesurge.jpg'
    );
  });

  it('renders nothing rather than a broken image when the icon is missing', () => {
    expect(abilityIconUrl(undefined)).toBeNull();
    expect(abilityIconUrl(null)).toBeNull();
    expect(abilityIconUrl('')).toBeNull();
  });

  it('refuses a name that carries a path — it does not come from a WCL payload', () => {
    expect(abilityIconUrl('a/b.jpg')).toBeNull();
    expect(abilityIconUrl('a\\b.jpg')).toBeNull();
    expect(abilityIconUrl('../../etc/passwd')).toBeNull();
  });
});

describe('collectIcons', () => {
  it('indexes casts, damage rows and auras under one name key', () => {
    const damage = {
      data: {
        entries: [{ guid: 1, name: 'Rip', total: 10, abilityIcon: 'rip.jpg' }],
      },
    };
    const casts = {
      data: {
        entries: [{ guid: 2, name: 'Shred', total: 4, abilityIcon: 'shred.jpg' }],
      },
    };
    const buffs = {
      data: {
        auras: [
          { guid: 3, name: "Tiger's Fury", totalUptime: 100, totalUses: 2, abilityIcon: 'tf.jpg' },
        ],
      },
    };

    expect(collectIcons(damage, casts, buffs)).toEqual({
      Rip: 'rip.jpg',
      Shred: 'shred.jpg',
      "Tiger's Fury": 'tf.jpg',
    });
  });

  it('keeps the first icon seen for a name and skips rows that carry none', () => {
    const first = {
      data: { entries: [{ guid: 1, name: 'Rip', total: 10, abilityIcon: 'a.jpg' }] },
    };
    const second = {
      data: { entries: [{ guid: 1, name: 'Rip', total: 3, abilityIcon: 'b.jpg' }] },
    };
    const bare = { data: { entries: [{ guid: 9, name: 'Melee', total: 1 }] } };

    expect(collectIcons(first, second, bare)).toEqual({ Rip: 'a.jpg' });
  });

  it('yields an empty index rather than throwing on absent tables', () => {
    expect(collectIcons(null, undefined, {})).toEqual({});
  });
});

describe('mergeIcons', () => {
  it('réunit les index et laisse le dernier gagner à nom égal', () => {
    expect(
      mergeIcons({ Pyroblast: 'ref.jpg', Fireball: 'fb.jpg' }, { Pyroblast: 'mine.jpg' })
    ).toEqual({
      Pyroblast: 'mine.jpg',
      Fireball: 'fb.jpg',
    });
  });

  it('ignore les index absents', () => {
    expect(mergeIcons(undefined, { Fireball: 'fb.jpg' }, undefined)).toEqual({
      Fireball: 'fb.jpg',
    });
    expect(mergeIcons()).toEqual({});
  });
});
