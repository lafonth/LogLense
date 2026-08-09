import type { PoolObservation } from '../pool';
import { describe, expect, it } from 'vitest';
import { buildPoolRecords, poolMonthKey, tierWeek } from '../pool';
import { LABEL_REASONS } from '../schema';

const SUBJECT = { code: 'aaa', fightID: 3, ilvl: 280, killTimeMs: 300_000 };

const META = {
  by: 'hash',
  at: '2026-08-08T12:00:00.000Z',
  encounterId: 3177,
  difficulty: 5,
  specId: 103,
  subject: SUBJECT,
};

function observation(over: Partial<PoolObservation> = {}): PoolObservation {
  return {
    code: 'bbb',
    fightID: 7,
    actorId: 12,
    ilvl: 280,
    killTimeMs: 300_000,
    dps: 100_000,
    distance: 1,
    verified: true,
    tierPieces: 4,
    externalUptime: 0,
    disqualifiedBy: [],
    explored: false,
    shown: false,
    substitute: false,
    ...over,
  };
}

describe('tierWeek', () => {
  it('numbers the week from the first Thursday, in UTC', () => {
    expect(tierWeek('2026-08-08T12:00:00.000Z')).toBe('2026-W32');
  });

  // Le 2027-01-01 est un vendredi : sa semaine ISO appartient encore à 2026. Un reset de tier
  // début janvier tomberait sinon dans deux clés selon le jour.
  it('keeps a new-year date in the ISO year of its Thursday', () => {
    expect(tierWeek('2027-01-01T00:00:00.000Z')).toBe('2026-W53');
    expect(tierWeek('2027-01-04T00:00:00.000Z')).toBe('2027-W01');
  });
});

describe('poolMonthKey', () => {
  it('keys by month, like the other corpus flows', () => {
    expect(poolMonthKey('2026-08-08T12:00:00.000Z')).toBe('labels:pool:2026-08');
  });
});

describe('buildPoolRecords', () => {
  it('emits one row per candidate, retenus and écartés alike', () => {
    const records = buildPoolRecords(
      [observation({ code: 'x', shown: true }), observation({ code: 'y' })],
      META
    );

    expect(records.map((r) => [r.candidate.code, r.shown])).toEqual([
      ['x', true],
      ['y', false],
    ]);
    expect(records[0]).toMatchObject({ v: 1, kind: 'pool', week: '2026-W32', subject: SUBJECT });
  });

  // Sans motif, un écarté n'est qu'une absence : c'est le motif qui en fait un contre-exemple.
  it('gives every écarté a motive from the closed list, and none to the shown', () => {
    const records = buildPoolRecords(
      [
        observation({ shown: true }),
        observation({ disqualifiedBy: ['set-bonus'] }),
        observation({ disqualifiedBy: ['external'] }),
        observation({ verified: false, actorId: null }),
        observation({ ilvl: 300 }),
        observation({ killTimeMs: 400_000 }),
      ],
      META
    );

    expect(records.map((r) => r.setAside)).toEqual([
      null,
      'set-bonus',
      'externals',
      'other',
      'ilvl',
      'kill-time',
    ]);
    for (const record of records) {
      expect(record.setAside === null || LABEL_REASONS.includes(record.setAside)).toBe(true);
    }
  });

  // `Infinity` veut dire « pas jugeable », pas « loin » : le sérialiser en JSON en ferait
  // `null` sans le dire, et prétendre `ilvl` là inventerait une mesure absente.
  it('stores an unjudgeable distance as null, with an unattributed motive', () => {
    const [record] = buildPoolRecords([observation({ distance: Infinity, ilvl: null })], META);

    expect(record.distance).toBeNull();
    expect(record.ilvlGap).toBeNull();
    expect(record.setAside).toBe('other');
  });

  it('signs both gaps relative to the subject', () => {
    const [above, below] = buildPoolRecords(
      [
        observation({ ilvl: 286, killTimeMs: 330_000 }),
        observation({ ilvl: 274, killTimeMs: 270_000 }),
      ],
      META
    );

    expect([above.ilvlGap, above.killTimeGapPct]).toEqual([6, 10]);
    expect([below.ilvlGap, below.killTimeGapPct]).toEqual([-6, -10]);
  });

  // Pointeurs seuls : rien de ce qui identifie un tiers, et aucun texte libre (§5d des CGU).
  it('carries no name and no free text', () => {
    const serialized = JSON.stringify(
      buildPoolRecords([observation(), observation({ shown: true })], META)
    );

    expect(serialized).not.toMatch(/name/i);
    expect(Object.keys(buildPoolRecords([observation()], META)[0].candidate)).toEqual([
      'code',
      'fightID',
      'actorId',
      'ilvl',
      'killTimeMs',
      'dps',
      'tierPieces',
      'externalUptime',
    ]);
  });

  // Dédupliquer demanderait une lecture avant écriture : la perte silencieuse qu'un corpus
  // append-only ne peut pas se permettre.
  it('keeps duplicates rather than reading before writing', () => {
    expect(buildPoolRecords([observation(), observation()], META)).toHaveLength(2);
  });
});
