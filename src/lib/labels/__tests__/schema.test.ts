import { describe, expect, it } from 'vitest';
import { LABEL_REASONS, MAX_FIELD_LENGTH, monthKey, parseSubmission } from '../schema';

function validBody() {
  return {
    renderId: 'a3f1c2d4-0000-4000-8000-000000000001',
    reason: 'externals',
    encounterId: 3177,
    difficulty: 5,
    specId: 103,
    subject: { code: 'abc', fightID: 17, actorId: 63 },
    reference: { code: 'xyz', fightID: 3, actorId: 12, disqualifiedBy: [] },
    scores: { distance: 0.42, ilvlGap: 0.9, killTimeGapPct: -2.7, rank: 1 },
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

  // Sans lui le verdict ne se joint à aucune exposition : il ne se déduplique pas, et le
  // positif faible qu'il devait contredire ne se dérive plus. Un orphelin par construction.
  it('rejects a verdict that points at no render', () => {
    const body = validBody();
    const { renderId, ...withoutRender } = body;
    expect(parseSubmission(withoutRender)).toBeNull();
    expect(parseSubmission({ ...body, renderId: '' })).toBeNull();
    expect(parseSubmission({ ...body, renderId: 42 })).toBeNull();
  });

  // §5c des CGU : aucun nom de tiers dans le corpus. `actorId` réhydrate ce que le nom disait.
  it('keeps no character name, on either side', () => {
    const parsed = parseSubmission({
      ...validBody(),
      subject: { code: 'abc', fightID: 17, actorId: 63, name: 'Jumbaa' },
      reference: { code: 'xyz', fightID: 3, actorId: 12, disqualifiedBy: [], name: 'Aidan' },
    });
    expect(parsed).not.toBeNull();
    expect(JSON.stringify(parsed)).not.toContain('Aidan');
    expect(JSON.stringify(parsed)).not.toContain('Jumbaa');
  });

  // Ce que le corps ne porte plus se réhydrate depuis WCL ; le recopier ferait vieillir le
  // corpus avec les mesures d'aujourd'hui plutôt qu'avec le pointeur qui les retrouve.
  it('drops the WCL measurements a client might still send', () => {
    const parsed = parseSubmission({
      ...validBody(),
      subject: { code: 'abc', fightID: 17, actorId: 63, ilvl: 284.1, killTimeMs: 326876 },
      reference: {
        code: 'xyz',
        fightID: 3,
        actorId: 12,
        disqualifiedBy: [],
        dps: 123456,
        tierPieces: 2,
        externalUptime: 12.5,
      },
      pool: { candidatesConsidered: 981, pagesFetched: 10, level: 'close' },
    });
    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty('pool');
    expect(parsed?.subject).toEqual({ code: 'abc', fightID: 17, actorId: 63 });
    expect(parsed?.reference).toEqual({ code: 'xyz', fightID: 3, actorId: 12, disqualifiedBy: [] });
  });

  // Les écarts restent quand les mesures partent : ce sont les jugements portés sur un vivier
  // qui n'existera plus dans un mois, et ils ne se recalculent pas.
  it('accepts a null ilvlGap', () => {
    const body = validBody();
    const parsed = parseSubmission({ ...body, scores: { ...body.scores, ilvlGap: null } });
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
    expect(parseSubmission({ ...body, renderId: 'a'.repeat(MAX_FIELD_LENGTH + 1) })).toBeNull();
  });

  it('rejects an empty report code', () => {
    const body = validBody();
    expect(parseSubmission({ ...body, subject: { ...body.subject, code: '' } })).toBeNull();
  });

  it('rejects a missing actor pointer', () => {
    const body = validBody();
    const { actorId, ...withoutActor } = body.reference;
    expect(parseSubmission({ ...body, reference: withoutActor })).toBeNull();
  });

  it('carries the verdict of the selection', () => {
    const body = validBody();
    const parsed = parseSubmission({
      ...body,
      reference: { ...body.reference, disqualifiedBy: ['set-bonus', 'external'] },
    });
    expect(parsed?.reference.disqualifiedBy).toEqual(['set-bonus', 'external']);
  });

  it('rejects a disqualification reason it does not know', () => {
    const body = validBody();
    expect(
      parseSubmission({ ...body, reference: { ...body.reference, disqualifiedBy: ['vibes'] } })
    ).toBeNull();
  });

  it('rejects a repeated or overlong disqualification list', () => {
    const body = validBody();
    // Both bound the same thing: what a hostile client can make the corpus grow by.
    expect(
      parseSubmission({
        ...body,
        reference: { ...body.reference, disqualifiedBy: ['external', 'external'] },
      })
    ).toBeNull();
    expect(
      parseSubmission({
        ...body,
        reference: {
          ...body.reference,
          disqualifiedBy: ['set-bonus', 'external', 'set-bonus'],
        },
      })
    ).toBeNull();
  });

  it('rejects a disqualification list that is not a list', () => {
    const body = validBody();
    expect(
      parseSubmission({ ...body, reference: { ...body.reference, disqualifiedBy: 'external' } })
    ).toBeNull();
    const { disqualifiedBy, ...withoutVerdict } = body.reference;
    expect(parseSubmission({ ...body, reference: withoutVerdict })).toBeNull();
  });

  it('rejects a non-object', () => {
    expect(parseSubmission(null)).toBeNull();
    expect(parseSubmission('nope')).toBeNull();
    expect(parseSubmission([])).toBeNull();
  });

  // The client must not be able to choose who it is or when this happened.
  it('drops client-supplied v, kind, at and by', () => {
    const parsed = parseSubmission({
      ...validBody(),
      v: 9,
      kind: 'exposure',
      at: '1999-01-01',
      by: 'someone-else',
    });
    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty('v');
    expect(parsed).not.toHaveProperty('kind');
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
