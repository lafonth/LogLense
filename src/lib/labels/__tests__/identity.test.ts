import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashUserId } from '../identity';

describe('hashUserId', () => {
  const original = process.env.LABEL_SALT;

  beforeEach(() => {
    process.env.LABEL_SALT = 'pepper';
  });

  afterEach(() => {
    if (original === undefined) delete process.env.LABEL_SALT;
    else process.env.LABEL_SALT = original;
  });

  it('is stable for the same input', () => {
    expect(hashUserId('someone@example.com')).toBe(hashUserId('someone@example.com'));
  });

  it('differs for different inputs', () => {
    expect(hashUserId('a@example.com')).not.toBe(hashUserId('b@example.com'));
  });

  it('never returns the input itself', () => {
    expect(hashUserId('someone@example.com')).not.toContain('someone');
  });

  it('returns 32 hex characters', () => {
    expect(hashUserId('someone@example.com')).toMatch(/^[0-9a-f]{32}$/);
  });

  it('changes when the salt changes', () => {
    const withPepper = hashUserId('someone@example.com');
    process.env.LABEL_SALT = 'other';
    expect(hashUserId('someone@example.com')).not.toBe(withPepper);
  });

  // Fail closed: a corpus mixing salted and unsalted identifiers is a corpus we can no
  // longer certify as free of personal data, and it cannot be cleaned up after the fact.
  it('throws rather than falling back when the salt is missing', () => {
    delete process.env.LABEL_SALT;
    expect(() => hashUserId('someone@example.com')).toThrow(/LABEL_SALT/);
  });

  it('throws when the salt is empty', () => {
    process.env.LABEL_SALT = '';
    expect(() => hashUserId('someone@example.com')).toThrow(/LABEL_SALT/);
  });
});
