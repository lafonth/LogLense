import type { RawRaidRanking } from './raid-ranking';
import { describe, expect, it } from 'vitest';
import { comparePiecesWithinPull } from './eligibility';
import { parseRaidRanking } from './raid-ranking';

const FIGHT = {
  id: 42,
  name: 'Fyrakk the Blazing',
  encounterID: 2677,
  kill: true,
  difficulty: 5,
  startTime: 0,
  endTime: 300_000,
};

function payload(over: {
  roles?: Record<string, { characters?: unknown[] }>;
  entries?: unknown[];
  actors?: { id: number; name: string; subType?: string }[];
  events?: unknown[];
}): RawRaidRanking {
  return {
    reportData: {
      report: {
        rankings: over.roles ? { data: [{ roles: over.roles }] } : { data: [] },
        table: { data: { entries: over.entries ?? [] } },
        events: { data: (over.events ?? []) as never },
        fights: [FIGHT],
        masterData: { actors: over.actors ?? [] },
      },
    },
  } as RawRaidRanking;
}

const ACTORS = [
  { id: 1, name: 'Arms', subType: 'Warrior' },
  { id: 2, name: 'Fury', subType: 'Warrior' },
  { id: 3, name: 'Healbot', subType: 'Priest' },
];

const ENTRIES = [
  { id: 1, name: 'Arms', total: 300_000, type: 'Warrior', icon: 'Warrior-Arms' },
  { id: 2, name: 'Fury', total: 600_000, type: 'Warrior', icon: 'Warrior-Fury' },
  { id: 3, name: 'Healbot', total: 30_000, type: 'Priest', icon: 'Priest-Holy' },
];

describe('parseRaidRanking — branche percentile', () => {
  const ranking = parseRaidRanking(
    payload({
      actors: ACTORS,
      entries: ENTRIES,
      roles: {
        dps: {
          characters: [
            { name: 'Fury', amount: 2000, rankPercent: 91.24, spec: 'Fury', class: 'Warrior' },
            { name: 'Arms', amount: 1000, rankPercent: 42.7, spec: 'Arms', class: 'Warrior' },
          ],
        },
        healers: { characters: [{ name: 'Healbot', amount: 100, rankPercent: 55 }] },
        tanks: { characters: [] },
      },
    }),
    'abcdefgh12345678'
  );

  it('classe par percentile croissant — le plus de marge en tête', () => {
    expect(ranking?.criterion).toBe('percentile');
    expect(ranking?.players.map((p) => p.name)).toEqual(['Arms', 'Fury']);
    expect(ranking?.players[0].percentile).toBe(42.7);
  });

  it('nomme son axe', () => {
    expect(ranking?.criterionReason).toMatch(/percentile/i);
  });

  it('résout la spec et garde l’acteur du rapport, pas l’id global', () => {
    expect(ranking?.players[0].specId).toBe(71);
    expect(ranking?.players[0].actorId).toBe(1);
  });

  it('ne classe ni soigneurs ni tanks', () => {
    expect(ranking?.players.map((p) => p.name)).not.toContain('Healbot');
  });

  it('porte la pull elle-même', () => {
    expect(ranking?.fightID).toBe(42);
    expect(ranking?.encounterID).toBe(2677);
    expect(ranking?.difficulty).toBe(5);
    expect(ranking?.kill).toBe(true);
  });
});

describe('parseRaidRanking — repli DPS', () => {
  it('bascule quand un joueur du combat manque au classement, et l’annonce', () => {
    const ranking = parseRaidRanking(
      payload({
        actors: ACTORS,
        entries: ENTRIES,
        roles: {
          dps: {
            characters: [
              { name: 'Fury', amount: 2000, rankPercent: 91.2, spec: 'Fury', class: 'Warrior' },
            ],
          },
        },
      }),
      'abcdefgh12345678'
    );

    expect(ranking?.criterion).toBe('dps');
    expect(ranking?.criterionReason).toMatch(/raw DPS/);
    // La phrase est figée mot pour mot : un `player(s)` qui reviendrait passerait un
    // `/without an entry/`.
    expect(ranking?.criterionReason).toContain('leaves 2 players of this pull without an entry');
    // 300 000 dégâts sur 300 s.
    expect(ranking?.players.find((p) => p.name === 'Arms')?.dps).toBe(1000);
    // Le soigneur n'a aucune entrée au classement : son rôle est inconnu, il reste dans la
    // liste plutôt que d'être deviné — et `criterionReason` est ce qui rend ça lisible.
    expect(ranking?.players.map((p) => p.name)).toEqual(['Healbot', 'Arms', 'Fury']);
  });

  it('bascule quand un DPS classé n’a pas de percentile, et le dit', () => {
    const ranking = parseRaidRanking(
      payload({
        actors: ACTORS,
        entries: ENTRIES,
        roles: {
          dps: {
            characters: [
              { name: 'Fury', amount: 2000, rankPercent: 91.2, spec: 'Fury', class: 'Warrior' },
              { name: 'Arms', amount: 1000, spec: 'Arms', class: 'Warrior' },
            ],
          },
          healers: { characters: [{ name: 'Healbot', amount: 100 }] },
        },
      }),
      'abcdefgh12345678'
    );

    expect(ranking?.criterion).toBe('dps');
    expect(ranking?.criterionReason).toMatch(/no Warcraft Logs percentile/);
    // Le soigneur reste exclu : son rôle est connu, lui.
    expect(ranking?.players.map((p) => p.name)).toEqual(['Arms', 'Fury']);
  });

  it('sans aucun classement, prévient que les rôles sont inconnus', () => {
    const ranking = parseRaidRanking(
      payload({ actors: ACTORS, entries: ENTRIES }),
      'abcdefgh12345678'
    );

    expect(ranking?.criterion).toBe('dps');
    expect(ranking?.criterionReason).toMatch(/ranks nobody/);
    expect(ranking?.criterionReason).toMatch(/healers and tanks/);
    // Faute de rôles, le soigneur est là — et l'écran le dit plutôt que de le cacher.
    expect(ranking?.players.map((p) => p.name)).toEqual(['Healbot', 'Arms', 'Fury']);
  });
});

describe('parseRaidRanking — set bonus lu dans le rapport', () => {
  it('rend le compte de pièces, et `null` sans CombatantInfo', () => {
    const ranking = parseRaidRanking(
      payload({
        actors: ACTORS,
        entries: ENTRIES,
        events: [{ sourceID: 1, specID: 71, gear: [{ setID: 7 }, { setID: 7 }, { setID: 3 }] }],
      }),
      'abcdefgh12345678'
    );

    const arms = ranking?.players.find((p) => p.name === 'Arms');
    const fury = ranking?.players.find((p) => p.name === 'Fury');
    expect(arms?.tierPieces).toBe(2);
    expect(fury?.tierPieces).toBeNull();
  });
});

describe('comparaison intra-raid', () => {
  it('a un écart de kill time nul, et ne prétend pas avoir mesuré les externals', () => {
    const verdict = comparePiecesWithinPull(4, 2);
    expect(verdict.killTimeGapPct).toBe(0);
    expect(verdict.measured).toEqual({ killTime: true, setBonus: true, externals: false });
    expect(verdict.disqualifiedBy).toEqual(['set-bonus']);
  });

  it('ne disqualifie pas une référence moins bien équipée', () => {
    expect(comparePiecesWithinPull(2, 4).disqualifiedBy).toEqual([]);
  });

  it('ne disqualifie pas sur un set inconnu, et le déclare non mesuré', () => {
    const verdict = comparePiecesWithinPull(null, 2);
    expect(verdict.disqualifiedBy).toEqual([]);
    expect(verdict.measured.setBonus).toBe(false);
  });
});

describe('parseRaidRanking — rapport absent', () => {
  it('rend null sans rapport', () => {
    expect(parseRaidRanking({ reportData: { report: null } }, 'abcdefgh12345678')).toBeNull();
  });

  it('rend null quand la pull n’est pas dans le rapport', () => {
    const empty = payload({});
    empty.reportData.report!.fights = [];
    expect(parseRaidRanking(empty, 'abcdefgh12345678')).toBeNull();
  });
});
