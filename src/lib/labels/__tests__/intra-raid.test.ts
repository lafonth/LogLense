import type { RaidRanking, RankedRaider } from '@/lib/wcl/raid-ranking';
import { describe, expect, it } from 'vitest';
import { buildIntraRaidPairs, intraRaidMonthKey } from '../intra-raid';

const META = { by: 'hash', at: '2026-08-20T10:00:00.000Z' };

function raider(over: Partial<RankedRaider> = {}): RankedRaider {
  return {
    actorId: 1,
    name: 'Jumbaa',
    className: 'Druid',
    specName: 'Feral',
    specId: 103,
    dps: 100_000,
    percentile: 50,
    tierPieces: 4,
    ...over,
  };
}

function ranking(players: RankedRaider[]): RaidRanking {
  return {
    code: 'abc',
    fightID: 7,
    encounterID: 3177,
    encounterName: 'Vorasius',
    difficulty: 5,
    kill: true,
    fightMs: 300_000,
    criterion: 'percentile',
    criterionReason: '',
    players,
  };
}

describe('intraRaidMonthKey', () => {
  it('buckets by month, so the cap closes a month and never the corpus', () => {
    expect(intraRaidMonthKey('2026-08-20T10:00:00.000Z')).toBe('labels:intra-raid:2026-08');
  });
});

describe('buildIntraRaidPairs', () => {
  it('pairs the players of a same spec, and stamps the pull as the fight pointer', () => {
    const pairs = buildIntraRaidPairs(
      ranking([raider({ actorId: 1, dps: 90_000 }), raider({ actorId: 2, dps: 100_000 })]),
      META
    );

    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({
      v: 1,
      kind: 'intra-raid',
      at: META.at,
      by: META.by,
      encounterId: 3177,
      difficulty: 5,
      specId: 103,
      fight: { code: 'abc', fightID: 7 },
      killTimeGapPct: 0,
      confidence: 'high',
    });
  });

  // Pointeurs seuls : aucun nom de tiers n'entre au corpus.
  it('carries pointers and scalars, never a third party name', () => {
    const pairs = buildIntraRaidPairs(
      ranking([
        raider({ actorId: 1, name: 'Jumbaa', dps: 90_000 }),
        raider({ actorId: 2, name: 'Guildmate', dps: 100_000 }),
      ]),
      META
    );

    expect(JSON.stringify(pairs)).not.toContain('Guildmate');
    expect(pairs[0].subject).toEqual({ actorId: 1, dps: 90_000, percentile: 50, tierPieces: 4 });
  });

  // `players` arrive trié par marge décroissante : le premier des deux est le sujet.
  it('takes the player with the most margin as the subject', () => {
    const pairs = buildIntraRaidPairs(
      ranking([
        raider({ actorId: 1, percentile: 20, dps: 90_000 }),
        raider({ actorId: 2, percentile: 80, dps: 100_000 }),
      ]),
      META
    );

    expect(pairs[0].subject.actorId).toBe(1);
    expect(pairs[0].reference.actorId).toBe(2);
  });

  it('emits every pair of a spec played by three raiders', () => {
    const pairs = buildIntraRaidPairs(
      ranking([raider({ actorId: 1 }), raider({ actorId: 2 }), raider({ actorId: 3 })]),
      META
    );

    expect(pairs.map((p) => [p.subject.actorId, p.reference.actorId])).toEqual([
      [1, 2],
      [1, 3],
      [2, 3],
    ]);
  });

  it('separates the specs: a pair never crosses two of them', () => {
    const pairs = buildIntraRaidPairs(
      ranking([
        raider({ actorId: 1, specId: 103 }),
        raider({ actorId: 2, specId: 250 }),
        raider({ actorId: 3, specId: 103 }),
      ]),
      META
    );

    expect(pairs).toHaveLength(1);
    expect(pairs[0].specId).toBe(103);
    expect([pairs[0].subject.actorId, pairs[0].reference.actorId]).toEqual([1, 3]);
  });

  // La classe positive vient de la paire, pas du joueur.
  it('emits nothing for a spec played by a single raider', () => {
    expect(buildIntraRaidPairs(ranking([raider({ specId: 103 })]), META)).toEqual([]);
  });

  // Un couple (classe, spec) que la table ne connaît pas n'apprend rien à personne.
  it('drops the raiders whose spec is unknown', () => {
    const pairs = buildIntraRaidPairs(
      ranking([
        raider({ actorId: 1, specId: null }),
        raider({ actorId: 2, specId: null }),
        raider({ actorId: 3, specId: 103 }),
      ]),
      META
    );

    expect(pairs).toEqual([]);
  });

  // Le set bonus est le seul critère qui reste à départager dans une même pull.
  it('disqualifies on set bonus when the reference wore the higher one', () => {
    const pairs = buildIntraRaidPairs(
      ranking([
        raider({ actorId: 1, tierPieces: 2, dps: 90_000 }),
        raider({ actorId: 2, tierPieces: 4, dps: 100_000 }),
      ]),
      META
    );

    expect(pairs[0].disqualifiedBy).toEqual(['set-bonus']);
    expect(pairs[0].measured).toEqual({ killTime: true, setBonus: true, externals: false });
  });

  it('does not disqualify a reference that wore less tier than the subject', () => {
    const pairs = buildIntraRaidPairs(
      ranking([
        raider({ actorId: 1, tierPieces: 4, dps: 90_000 }),
        raider({ actorId: 2, tierPieces: 2, dps: 100_000 }),
      ]),
      META
    );

    expect(pairs[0].disqualifiedBy).toEqual([]);
  });

  // Un `null` n'est pas un zéro : un rapport sans équipement ne disqualifie personne, et il
  // le dit — `setBonus: false` signale que le critère n'a pas été mesuré.
  it('reports an unmeasured set bonus rather than reading a hole as zero', () => {
    const pairs = buildIntraRaidPairs(
      ranking([
        raider({ actorId: 1, tierPieces: null, dps: 90_000 }),
        raider({ actorId: 2, tierPieces: 4, dps: 100_000 }),
      ]),
      META
    );

    expect(pairs[0].disqualifiedBy).toEqual([]);
    expect(pairs[0].measured.setBonus).toBe(false);
  });

  // Les externals demanderaient une requête par joueur : déclarés non mesurés, jamais à zéro.
  it('never claims the externals were measured', () => {
    const pairs = buildIntraRaidPairs(
      ranking([raider({ actorId: 1 }), raider({ actorId: 2 })]),
      META
    );

    expect(pairs[0].measured.externals).toBe(false);
  });

  it('states the gap in points of the subject dps', () => {
    const pairs = buildIntraRaidPairs(
      ranking([raider({ actorId: 1, dps: 100_000 }), raider({ actorId: 2, dps: 112_500 })]),
      META
    );

    expect(pairs[0].dpsGapPct).toBe(12.5);
  });

  it('reports a zero gap rather than a division by zero when the subject did no damage', () => {
    const pairs = buildIntraRaidPairs(
      ranking([raider({ actorId: 1, dps: 0 }), raider({ actorId: 2, dps: 100_000 })]),
      META
    );

    expect(pairs[0].dpsGapPct).toBe(0);
  });

  it('keeps an anonymous batch anonymous', () => {
    const pairs = buildIntraRaidPairs(ranking([raider({ actorId: 1 }), raider({ actorId: 2 })]), {
      by: null,
      at: META.at,
    });

    expect(pairs[0].by).toBeNull();
  });
});
