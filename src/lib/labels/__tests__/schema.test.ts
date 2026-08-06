import { describe, expect, it } from 'vitest';
import { LABEL_REASONS, MAX_FIELD_LENGTH, monthKey, parseSubmission } from '../schema';

function validBody() {
  return {
    reason: 'externals',
    encounterId: 3177,
    difficulty: 5,
    specId: 103,
    subject: { code: 'abc', fightID: 17, actorId: 63, ilvl: 284.1, killTimeMs: 326876 },
    reference: {
      code: 'xyz',
      fightID: 3,
      name: 'Aidan',
      ilvl: 285,
      killTimeMs: 317924,
      dps: 123456,
    },
    scores: { distance: 0.42, ilvlGap: 0.9, killTimeGapPct: -2.7, rank: 1 },
    pool: { candidatesConsidered: 981, pagesFetched: 10, level: 'close' },
  };
}

describe('parseSubmission', () => {
  it('accepts a well-formed body unchanged', () => {
    const body = validBody();
    expect(parseSubmission(body)).toEqual(body);
  });

  it('accepts every reason in the closed list', () => {
    for (const reason of LABEL_REASONS) {
      expect(parseSubmission({ ...validBody(), reason })).not.toBeNull();
    }
  });

  it('rejects a reason outside the list', () => {
    expect(parseSubmission({ ...validBody(), reason: 'bad-vibes' })).toBeNull();
  });

  it('rejects a comparability level outside the four known ones', () => {
    const body = validBody();
    expect(parseSubmission({ ...body, pool: { ...body.pool, level: 'perfect' } })).toBeNull();
  });

  it('accepts a null ilvl and a null ilvlGap together', () => {
    const body = validBody();
    const parsed = parseSubmission({
      ...body,
      reference: { ...body.reference, ilvl: null },
      scores: { ...body.scores, ilvlGap: null },
    });
    expect(parsed?.reference.ilvl).toBeNull();
    expect(parsed?.scores.ilvlGap).toBeNull();
  });

  it('rejects a missing nested block', () => {
    const body = validBody();
    const { scores, ...withoutScores } = body;
    expect(parseSubmission(withoutScores)).toBeNull();
  });

  it('rejects a numeric field sent as a string', () => {
    const body = validBody();
    expect(parseSubmission({ ...body, encounterId: '3177' })).toBeNull();
  });

  it('rejects a non-finite number', () => {
    const body = validBody();
    expect(
      parseSubmission({ ...body, scores: { ...body.scores, killTimeGapPct: Number.NaN } })
    ).toBeNull();
  });

  // The unscorable candidate is exactly the illegitimate comparison — the label worth most.
  it('accepts a null distance', () => {
    const body = validBody();
    const parsed = parseSubmission({ ...body, scores: { ...body.scores, distance: null } });
    expect(parsed?.scores.distance).toBeNull();
  });

  it('rejects a string past the field length cap', () => {
    const body = validBody();
    const parsed = parseSubmission({
      ...body,
      reference: { ...body.reference, name: 'A'.repeat(MAX_FIELD_LENGTH + 1) },
    });
    expect(parsed).toBeNull();
  });

  it('rejects an empty report code', () => {
    const body = validBody();
    expect(parseSubmission({ ...body, subject: { ...body.subject, code: '' } })).toBeNull();
  });

  it('rejects a non-object', () => {
    expect(parseSubmission(null)).toBeNull();
    expect(parseSubmission('nope')).toBeNull();
    expect(parseSubmission([])).toBeNull();
  });

  // The client must not be able to choose who it is or when this happened.
  it('drops client-supplied v, at and by', () => {
    const parsed = parseSubmission({ ...validBody(), v: 9, at: '1999-01-01', by: 'someone-else' });
    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty('v');
    expect(parsed).not.toHaveProperty('at');
    expect(parsed).not.toHaveProperty('by');
  });
});

describe('monthKey', () => {
  it('buckets by calendar month', () => {
    expect(monthKey('2026-08-06T09:14:22.000Z')).toBe('labels:comparability:2026-08');
    expect(monthKey('2026-12-31T23:59:59.999Z')).toBe('labels:comparability:2026-12');
  });
});
