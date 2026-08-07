import { describe, expect, it } from 'vitest';
import { PROMPT_AXES } from '@/lib/ai/prompt';
import { parseReportFeedback, reportMonthKey } from '../report';

function submission(overrides: Record<string, unknown> = {}) {
  return {
    renderId: 'a3f1c2d4-0000-4000-8000-000000000001',
    verdict: 'useless',
    uselessAxes: ['talents'],
    encounterId: 3306,
    difficulty: 5,
    specId: 103,
    ...overrides,
  };
}

describe('parseReportFeedback', () => {
  it('accepts a well-formed feedback and copies only what it validated', () => {
    expect(parseReportFeedback(submission())).toEqual({
      renderId: 'a3f1c2d4-0000-4000-8000-000000000001',
      verdict: 'useless',
      uselessAxes: ['talents'],
      encounterId: 3306,
      difficulty: 5,
      specId: 103,
    });
  });

  // « Utile, mais les talents n'ont rien apporté » est un jugement plus précis que les deux
  // autres : le refuser reviendrait à jeter le retour le plus informatif du lot.
  it('accepts flagged axes on a useful verdict', () => {
    const parsed = parseReportFeedback(submission({ verdict: 'useful' }));

    expect(parsed?.verdict).toBe('useful');
    expect(parsed?.uselessAxes).toEqual(['talents']);
  });

  it('accepts an empty axis list', () => {
    expect(parseReportFeedback(submission({ uselessAxes: [] }))?.uselessAxes).toEqual([]);
  });

  // La jointure avec l'empreinte et l'exposition. Sans elle, le retour ne dit de quel
  // conseil il parle.
  it('rejects a feedback without a renderId', () => {
    expect(parseReportFeedback(submission({ renderId: undefined }))).toBeNull();
    expect(parseReportFeedback(submission({ renderId: '' }))).toBeNull();
    expect(parseReportFeedback(submission({ renderId: 'x'.repeat(65) }))).toBeNull();
  });

  it('rejects a verdict outside the two known ones', () => {
    expect(parseReportFeedback(submission({ verdict: 'meh' }))).toBeNull();
    expect(parseReportFeedback(submission({ verdict: 3 }))).toBeNull();
  });

  // Le vocabulaire des axes est celui du prompt : un axe inconnu ne se confronte à rien.
  it('rejects unknown, duplicated or over-long axis lists', () => {
    expect(parseReportFeedback(submission({ uselessAxes: ['vibes'] }))).toBeNull();
    expect(parseReportFeedback(submission({ uselessAxes: ['talents', 'talents'] }))).toBeNull();
    expect(
      parseReportFeedback(submission({ uselessAxes: [...PROMPT_AXES, 'talents'] }))
    ).toBeNull();
    expect(parseReportFeedback(submission({ uselessAxes: 'talents' }))).toBeNull();
  });

  it('rejects non-numeric identifiers', () => {
    expect(parseReportFeedback(submission({ encounterId: '3306' }))).toBeNull();
    expect(parseReportFeedback(submission({ difficulty: Number.NaN }))).toBeNull();
    expect(parseReportFeedback(submission({ specId: null }))).toBeNull();
  });

  it('rejects anything that is not an object', () => {
    expect(parseReportFeedback(null)).toBeNull();
    expect(parseReportFeedback('useless')).toBeNull();
    expect(parseReportFeedback([submission()])).toBeNull();
  });

  // Ce que le serveur possède ne se reprend jamais de l'entrée.
  it('drops client-supplied identity and timestamp fields', () => {
    const parsed = parseReportFeedback(
      submission({ v: 9, kind: 'advice', at: '1999-01-01T00:00:00.000Z', by: 'someone-else' })
    );

    expect(parsed).not.toHaveProperty('by');
    expect(parsed).not.toHaveProperty('at');
    expect(parsed).not.toHaveProperty('kind');
    expect(parsed).not.toHaveProperty('v');
  });
});

describe('reportMonthKey', () => {
  it('buckets by month, in its own namespace', () => {
    expect(reportMonthKey('2026-08-07T09:14:22.000Z')).toBe('labels:report:2026-08');
    expect(reportMonthKey('2027-01-01T00:00:00.000Z')).toBe('labels:report:2027-01');
  });
});
