import { describe, expect, it } from 'vitest';
import { isNum, isOneOf, isRecord, isStr, MAX_INPUT_LENGTH, readJson } from '../parse';

describe('isRecord', () => {
  it('accepts a plain object', () => {
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it('rejects null, arrays and primitives', () => {
    expect(isRecord(null)).toBe(false);
    // Un tableau passe `typeof === 'object'` : c'est la forme qu'un client envoie quand il
    // se trompe de route, et l'accepter ferait lire des index comme des champs.
    expect(isRecord([1, 2])).toBe(false);
    expect(isRecord('x')).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });
});

describe('isNum', () => {
  it('accepts finite numbers, including zero and negatives', () => {
    expect(isNum(0)).toBe(true);
    expect(isNum(-3)).toBe(true);
    expect(isNum(1.5)).toBe(true);
  });

  it('rejects NaN, infinities and numeric strings', () => {
    expect(isNum(Number.NaN)).toBe(false);
    expect(isNum(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isNum('12')).toBe(false);
  });
});

describe('isStr', () => {
  it('accepts a non-empty bounded string', () => {
    expect(isStr('Kaltarion')).toBe(true);
    expect(isStr('a'.repeat(MAX_INPUT_LENGTH))).toBe(true);
  });

  it('rejects the empty string and anything past the cap', () => {
    expect(isStr('')).toBe(false);
    expect(isStr('a'.repeat(MAX_INPUT_LENGTH + 1))).toBe(false);
    expect(isStr(12)).toBe(false);
  });
});

describe('isOneOf', () => {
  const DIFFICULTIES = [3, 4, 5] as const;

  it('accepts a member and rejects everything else', () => {
    expect(isOneOf(5, DIFFICULTIES)).toBe(true);
    expect(isOneOf(6, DIFFICULTIES)).toBe(false);
    // `'5'` est ce qu'un formulaire envoie sans conversion : la comparaison doit rester
    // stricte, sinon la difficulté arrive en chaîne jusqu'à la requête WCL.
    expect(isOneOf('5', DIFFICULTIES)).toBe(false);
  });
});

describe('readJson', () => {
  it('returns the parsed body', async () => {
    const req = { json: async () => ({ code: 'abc' }) } as unknown as Request;
    await expect(readJson(req)).resolves.toEqual({ code: 'abc' });
  });

  it('returns null rather than throwing on a malformed body', async () => {
    const req = {
      json: async () => {
        throw new SyntaxError('Unexpected end of JSON input');
      },
    } as unknown as Request;

    await expect(readJson(req)).resolves.toBeNull();
  });
});
