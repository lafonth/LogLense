import type { StoredCharacter } from '@/types';
import { describe, expect, it } from 'vitest';
import { MAX_INPUT_LENGTH } from '../parse';
import { charKey, parseStoredCharacter, readStoredCharacters } from '../stored-character';

function character(over: Partial<StoredCharacter> = {}): StoredCharacter {
  return {
    name: 'Alpha',
    realmName: 'Hyjal',
    realmSlug: 'hyjal',
    region: 'eu',
    class: 'Mage',
    ...over,
  };
}

describe('charKey', () => {
  it('folds the case Redis kept from whatever the client typed', () => {
    expect(charKey(character({ name: 'ALPHA', realmSlug: 'Hyjal', region: 'EU' }))).toBe(
      charKey(character())
    );
  });

  it('separates two players of the same name on two realms', () => {
    expect(charKey(character())).not.toBe(charKey(character({ realmSlug: 'kazzak' })));
  });

  it('separates the same name and realm across two regions', () => {
    expect(charKey(character())).not.toBe(charKey(character({ region: 'us' })));
  });
});

describe('parseStoredCharacter', () => {
  it('keeps the five fields it knows and drops whatever else came with them', () => {
    expect(parseStoredCharacter({ ...character(), spec: 'Fire', admin: true })).toEqual(
      character()
    );
  });

  it('refuses what is not an object, arrays included', () => {
    for (const input of [null, undefined, 'Alpha', 7, [character()]]) {
      expect(parseStoredCharacter(input)).toBeNull();
    }
  });

  it('refuses a missing field rather than letting charKey throw a 500 on it', () => {
    for (const field of ['name', 'realmName', 'realmSlug', 'region', 'class']) {
      const { [field]: _dropped, ...rest } = character() as unknown as Record<string, unknown>;
      expect(parseStoredCharacter(rest)).toBeNull();
    }
  });

  it('refuses a field that is not a string', () => {
    expect(parseStoredCharacter(character({ name: 42 as unknown as string }))).toBeNull();
    expect(parseStoredCharacter(character({ region: null as unknown as string }))).toBeNull();
  });

  it('refuses an empty string, which would build a key with a hole in it', () => {
    expect(parseStoredCharacter(character({ realmSlug: '' }))).toBeNull();
  });

  it('refuses a field longer than the cap: no code shortens the key it would inflate', () => {
    expect(parseStoredCharacter(character({ name: 'a'.repeat(MAX_INPUT_LENGTH) }))).toEqual(
      character({ name: 'a'.repeat(MAX_INPUT_LENGTH) })
    );
    expect(parseStoredCharacter(character({ name: 'a'.repeat(MAX_INPUT_LENGTH + 1) }))).toBeNull();
  });
});

describe('readStoredCharacters', () => {
  it('reads back a list that was written by this version', () => {
    expect(
      readStoredCharacters(JSON.stringify([character(), character({ name: 'Bravo' })]))
    ).toEqual([character(), character({ name: 'Bravo' })]);
  });

  it('starts from an empty list rather than failing the pin that follows', () => {
    expect(readStoredCharacters(null)).toEqual([]);
    expect(readStoredCharacters('')).toEqual([]);
    expect(readStoredCharacters('{ not json')).toEqual([]);
  });

  it('refuses a payload that is not a list', () => {
    expect(readStoredCharacters(JSON.stringify(character()))).toEqual([]);
  });

  it('drops the entries an older version wrote and keeps the rest of the list', () => {
    const raw = JSON.stringify([
      character(),
      { name: 'Bravo' },
      null,
      character({ name: 'Charlie' }),
    ]);
    expect(readStoredCharacters(raw)).toEqual([character(), character({ name: 'Charlie' })]);
  });
});
