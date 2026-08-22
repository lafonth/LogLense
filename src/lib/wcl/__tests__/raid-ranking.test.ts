import type { CombatantEvent } from '../combatant';
import type { RawRaidRanking } from '../raid-ranking';
import { describe, expect, it } from 'vitest';
import { parseRaidRanking } from '../raid-ranking';

type Report = NonNullable<RawRaidRanking['reportData']['report']>;

const CODE = 'aBcDeFgH12345678';

/** 300 s of pull: the divisor behind every DPS computed in this file. */
const FIGHT = {
  id: 7,
  name: 'Ulgrax the Devourer',
  encounterID: 2902,
  kill: true,
  difficulty: 5,
  startTime: 1_000,
  endTime: 301_000,
};

/** Pinned verbatim: the fallback says what it costs, and the screen shows that sentence. */
const RAW_DPS_CAVEAT =
  'The order is raw DPS, not a position in a distribution: specs that are weak this tier sit at the bottom for that reason alone.';

const PERCENTILE_REASON =
  'Ranked by Warcraft Logs percentile: where each player sits in the distribution for their spec on this boss. The lowest has the most room to gain.';

function payload(report: Partial<Report> | null): RawRaidRanking {
  if (report === null) return { reportData: { report: null } };
  return { reportData: { report: { fights: [FIGHT], ...report } } };
}

function damage(
  name: string,
  id: number,
  total: number,
  extra: { type?: string; icon?: string } = {}
) {
  return { name, id, total, ...extra };
}

function actor(name: string, id: number) {
  return { id, name, subType: 'Player' };
}

function combatantInfo(sourceID: number, pieces: number): CombatantEvent {
  return {
    sourceID,
    specID: 63,
    gear: Array.from({ length: pieces }, (_, i) => ({
      itemLevel: 639,
      id: 200 + i,
      quality: 4,
      setID: 1983,
    })),
  };
}

describe('parseRaidRanking, degenerate payloads', () => {
  it('gives up when the report is missing', () => {
    expect(parseRaidRanking(payload(null), CODE)).toBeNull();
  });

  it('gives up when the pull is absent from the report', () => {
    expect(parseRaidRanking(payload({ fights: [] }), CODE)).toBeNull();
  });

  it('floors the duration at zero when the timestamps are inverted', () => {
    // And the DPS with it: dividing by a negative duration would rank the pull backwards,
    // dividing by zero would print Infinity.
    const result = parseRaidRanking(
      payload({
        fights: [{ ...FIGHT, startTime: 301_000, endTime: 1_000 }],
        table: { data: { entries: [damage('Alpha', 11, 900_000_000)] } },
      }),
      CODE
    );

    expect(result?.fightMs).toBe(0);
    expect(result?.players[0]?.dps).toBe(0);
  });

  it('carries the identity of the pull through to the caller', () => {
    const result = parseRaidRanking(payload({}), CODE);

    expect(result).toMatchObject({
      code: CODE,
      fightID: 7,
      encounterID: 2902,
      encounterName: 'Ulgrax the Devourer',
      difficulty: 5,
      kill: true,
      fightMs: 300_000,
    });
  });
});

describe('parseRaidRanking, percentile axis', () => {
  const covered = payload({
    rankings: {
      data: [
        {
          roles: {
            dps: {
              characters: [
                {
                  name: 'Bravo',
                  amount: 812_345.6,
                  rankPercent: 90.44,
                  spec: 'Fire',
                  class: 'Mage',
                },
                {
                  name: 'Alpha',
                  amount: 640_000,
                  rankPercent: 40.05,
                  spec: 'Frost',
                  class: 'Mage',
                },
              ],
            },
          },
        },
      ],
    },
    table: {
      data: {
        entries: [damage('Alpha', 11, 192_000_000), damage('Bravo', 12, 243_703_680)],
      },
    },
    masterData: { actors: [actor('Alpha', 11), actor('Bravo', 12)] },
  });

  it('ranks on the percentile, lowest first, rounded to a tenth', () => {
    const result = parseRaidRanking(covered, CODE);

    expect(result?.criterion).toBe('percentile');
    expect(result?.criterionReason).toBe(PERCENTILE_REASON);
    expect(result?.players.map((p) => [p.name, p.percentile])).toEqual([
      ['Alpha', 40.1],
      ['Bravo', 90.4],
    ]);
  });

  it('reads the DPS from the ranking rather than recomputing it', () => {
    const result = parseRaidRanking(covered, CODE);

    expect(result?.players.map((p) => p.dps)).toEqual([640_000, 812_346]);
  });

  it('resolves the spec of a ranked player against the spec table', () => {
    const result = parseRaidRanking(covered, CODE);

    expect(result?.players[0]).toMatchObject({
      className: 'Mage',
      specName: 'Frost',
      specId: 64,
    });
    expect(result?.players[1]?.specId).toBe(63);
  });
});

describe('parseRaidRanking, percentile axis and actor resolution', () => {
  it('breaks a percentile tie on the name', () => {
    const result = parseRaidRanking(
      payload({
        rankings: {
          data: [
            {
              roles: {
                dps: {
                  characters: [
                    { name: 'Zeta', amount: 1, rankPercent: 50, spec: 'Fire', class: 'Mage' },
                    { name: 'Alpha', amount: 2, rankPercent: 50, spec: 'Fire', class: 'Mage' },
                  ],
                },
              },
            },
          ],
        },
        table: { data: { entries: [damage('Alpha', 11, 10), damage('Zeta', 12, 20)] } },
        masterData: { actors: [actor('Alpha', 11), actor('Zeta', 12)] },
      }),
      CODE
    );

    expect(result?.players.map((p) => p.name)).toEqual(['Alpha', 'Zeta']);
  });

  it('drops a ranked player this report has no actor for', () => {
    // `rankings[].id` is a global character id: without a local actor there is nothing to
    // open, so the row would lead nowhere.
    const result = parseRaidRanking(
      payload({
        rankings: {
          data: [
            {
              roles: {
                dps: {
                  characters: [
                    { name: 'Alpha', amount: 10, rankPercent: 50, spec: 'Fire', class: 'Mage' },
                    { name: 'Ghost', amount: 20, rankPercent: 60, spec: 'Fire', class: 'Mage' },
                  ],
                },
              },
            },
          ],
        },
        table: { data: { entries: [damage('Alpha', 11, 10)] } },
        masterData: { actors: [actor('Alpha', 11)] },
      }),
      CODE
    );

    expect(result?.criterion).toBe('percentile');
    expect(result?.players.map((p) => p.name)).toEqual(['Alpha']);
  });

  it('prefers masterData over the damage table to resolve an actor', () => {
    const result = parseRaidRanking(
      payload({
        rankings: {
          data: [
            {
              roles: {
                dps: {
                  characters: [
                    { name: 'Alpha', amount: 10, rankPercent: 50, spec: 'Fire', class: 'Mage' },
                  ],
                },
              },
            },
          ],
        },
        table: { data: { entries: [damage('Alpha', 99, 10)] } },
        masterData: { actors: [actor('Alpha', 11)] },
      }),
      CODE
    );

    expect(result?.players[0]?.actorId).toBe(11);
  });

  it('falls back on the damage table when masterData is silent', () => {
    const result = parseRaidRanking(
      payload({
        rankings: {
          data: [
            {
              roles: {
                dps: {
                  characters: [
                    { name: 'Alpha', amount: 10, rankPercent: 50, spec: 'Fire', class: 'Mage' },
                  ],
                },
              },
            },
          ],
        },
        table: { data: { entries: [damage('Alpha', 99, 10)] } },
      }),
      CODE
    );

    expect(result?.players[0]?.actorId).toBe(99);
  });

  it('reads the tier pieces from the CombatantInfo, and says null without one', () => {
    // Never zero: zero would read as "wears no tier", a claim this payload cannot support.
    const result = parseRaidRanking(
      payload({
        rankings: {
          data: [
            {
              roles: {
                dps: {
                  characters: [
                    { name: 'Alpha', amount: 10, rankPercent: 10, spec: 'Fire', class: 'Mage' },
                    { name: 'Bravo', amount: 20, rankPercent: 20, spec: 'Fire', class: 'Mage' },
                  ],
                },
              },
            },
          ],
        },
        table: { data: { entries: [damage('Alpha', 11, 10), damage('Bravo', 12, 20)] } },
        masterData: { actors: [actor('Alpha', 11), actor('Bravo', 12)] },
        events: { data: [combatantInfo(11, 4)] },
      }),
      CODE
    );

    expect(result?.players.map((p) => p.tierPieces)).toEqual([4, null]);
  });
});

describe('parseRaidRanking, DPS fallback', () => {
  it('names the axis when Warcraft Logs ranks nobody on the pull', () => {
    const result = parseRaidRanking(
      payload({
        table: {
          data: {
            entries: [
              damage('Alpha', 11, 900_000_000),
              damage('Bravo', 12, 300_000_000),
              damage('Idle', 13, 0),
            ],
          },
        },
        masterData: { actors: [actor('Alpha', 11), actor('Bravo', 12), actor('Idle', 13)] },
      }),
      CODE
    );

    expect(result?.criterion).toBe('dps');
    expect(result?.criterionReason).toBe(
      `Warcraft Logs ranks nobody on this pull. ${RAW_DPS_CAVEAT} Roles are unknown, so healers and tanks show up in the list.`
    );
    // An entry with no damage is not a damager: it is neither listed nor counted.
    expect(result?.players.map((p) => p.name)).toEqual(['Bravo', 'Alpha']);
  });

  it('computes the DPS from the total over the duration of the pull', () => {
    const result = parseRaidRanking(
      payload({
        table: { data: { entries: [damage('Alpha', 11, 900_000_000)] } },
        masterData: { actors: [actor('Alpha', 11)] },
      }),
      CODE
    );

    expect(result?.players[0]?.dps).toBe(3_000_000);
  });

  it('names the axis when the ranking leaves a damager out', () => {
    const result = parseRaidRanking(
      payload({
        rankings: {
          data: [
            {
              roles: {
                dps: {
                  characters: [
                    { name: 'Alpha', amount: 10, rankPercent: 50, spec: 'Fire', class: 'Mage' },
                  ],
                },
              },
            },
          ],
        },
        table: { data: { entries: [damage('Alpha', 11, 10), damage('Ghost', 12, 20)] } },
        masterData: { actors: [actor('Alpha', 11), actor('Ghost', 12)] },
      }),
      CODE
    );

    expect(result?.criterion).toBe('dps');
    expect(result?.criterionReason).toBe(
      `The Warcraft Logs ranking leaves 1 player of this pull without an entry, out of the 2 who dealt damage. ${RAW_DPS_CAVEAT}`
    );
  });

  it('agrees the plural when several damagers are left out', () => {
    const result = parseRaidRanking(
      payload({
        rankings: {
          data: [
            {
              roles: {
                dps: {
                  characters: [
                    { name: 'Alpha', amount: 10, rankPercent: 50, spec: 'Fire', class: 'Mage' },
                  ],
                },
              },
            },
          ],
        },
        table: {
          data: {
            entries: [damage('Alpha', 11, 10), damage('Ghost', 12, 20), damage('Wraith', 13, 30)],
          },
        },
        masterData: { actors: [actor('Alpha', 11), actor('Ghost', 12), actor('Wraith', 13)] },
      }),
      CODE
    );

    expect(result?.criterionReason).toBe(
      `The Warcraft Logs ranking leaves 2 players of this pull without an entry, out of the 3 who dealt damage. ${RAW_DPS_CAVEAT}`
    );
  });

  it('names the axis when a ranked DPS carries no percentile', () => {
    const result = parseRaidRanking(
      payload({
        rankings: {
          data: [
            {
              roles: {
                dps: {
                  characters: [
                    { name: 'Alpha', amount: 10, rankPercent: 50, spec: 'Fire', class: 'Mage' },
                    { name: 'Bravo', amount: 20, spec: 'Fire', class: 'Mage' },
                  ],
                },
              },
            },
          ],
        },
        table: { data: { entries: [damage('Alpha', 11, 10), damage('Bravo', 12, 20)] } },
        masterData: { actors: [actor('Alpha', 11), actor('Bravo', 12)] },
      }),
      CODE
    );

    expect(result?.criterion).toBe('dps');
    expect(result?.criterionReason).toBe(
      `1 of the 2 DPS on this pull has no Warcraft Logs percentile. ${RAW_DPS_CAVEAT}`
    );
  });

  it('drops a damager the report has no actor id for', () => {
    const result = parseRaidRanking(
      payload({
        table: { data: { entries: [damage('Alpha', 11, 10), { name: 'Nameless', total: 20 }] } },
      }),
      CODE
    );

    expect(result?.players.map((p) => p.name)).toEqual(['Alpha']);
  });

  it('reads the tier pieces of a fallback player too', () => {
    const result = parseRaidRanking(
      payload({
        table: { data: { entries: [damage('Alpha', 11, 10), damage('Bravo', 12, 20)] } },
        masterData: { actors: [actor('Alpha', 11), actor('Bravo', 12)] },
        events: { data: [combatantInfo(11, 2)] },
      }),
      CODE
    );

    expect(result?.players.map((p) => [p.name, p.tierPieces])).toEqual([
      ['Alpha', 2],
      ['Bravo', null],
    ]);
  });
});

describe('parseRaidRanking, DPS fallback on a mixed roster', () => {
  const mixedRoster = payload({
    rankings: {
      data: [
        {
          roles: {
            dps: {
              characters: [
                { name: 'Alpha', amount: 10, rankPercent: 50.06, spec: 'Fire', class: 'Mage' },
              ],
            },
            tanks: {
              characters: [
                { name: 'Tanky', amount: 5, rankPercent: 80, spec: 'Protection', class: 'Warrior' },
              ],
            },
            healers: {
              characters: [
                { name: 'Healy', amount: 1, rankPercent: 70, spec: 'Holy', class: 'Priest' },
              ],
            },
          },
        },
      ],
    },
    table: {
      data: {
        entries: [
          damage('Alpha', 11, 300_000_000, { icon: 'Mage-Fire' }),
          damage('Tanky', 12, 150_000_000, { icon: 'Warrior-Protection' }),
          damage('Healy', 13, 30_000_000, { icon: 'Priest-Holy' }),
          damage('Ghost', 14, 600_000_000, { type: 'Hunter', icon: 'Hunter' }),
        ],
      },
    },
    masterData: {
      actors: [actor('Alpha', 11), actor('Tanky', 12), actor('Healy', 13), actor('Ghost', 14)],
    },
  });

  it('keeps tanks and healers out of the list', () => {
    // They deal damage, so they are damagers; the product ranks DPS, so they are not rows.
    const result = parseRaidRanking(mixedRoster, CODE);

    expect(result?.criterion).toBe('dps');
    expect(result?.players.map((p) => p.name)).toEqual(['Alpha', 'Ghost']);
  });

  it('carries the percentile of a ranked player, and null for the one without', () => {
    const result = parseRaidRanking(mixedRoster, CODE);

    expect(result?.players.map((p) => p.percentile)).toEqual([50.1, null]);
  });

  it('reads class and spec from the damage icon, and nothing from a malformed one', () => {
    const result = parseRaidRanking(mixedRoster, CODE);

    expect(result?.players[0]).toMatchObject({
      className: 'Mage',
      specName: 'Fire',
      specId: 63,
    });
    // `Hunter` alone carries no spec: the class falls back on the entry type, and the spec
    // stays unknown rather than being guessed.
    expect(result?.players[1]).toMatchObject({
      className: 'Hunter',
      specName: null,
      specId: null,
    });
  });
});
