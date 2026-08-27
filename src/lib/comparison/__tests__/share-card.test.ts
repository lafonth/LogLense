import type { BossResult, Comparability, ReferenceSample } from '@/types';
import { describe, expect, it } from 'vitest';
import { buildShareCard } from '../share-card';

function sample(dps: number): ReferenceSample {
  return {
    name: `Ref${dps}`,
    code: 'R1',
    fightID: 1,
    actorId: 1,
    stats: { avgIlvl: 292 } as ReferenceSample['stats'],
    dps,
    killTimeMs: 300000,
    qualified: true,
    tierPieces: 2,
    externalUptime: 0,
    explored: false,
  };
}

function comparability(over: Partial<Comparability> = {}): Comparability {
  return {
    level: 'close',
    referenceIlvl: 285,
    referenceIlvlCount: 3,
    myIlvl: 284,
    referenceKillTimeMs: 305000,
    myKillTimeMs: 300000,
    candidatesConsidered: 942,
    pagesFetched: 10,
    disqualified: 0,
    unverifiable: 0,
    substituted: 0,
    poolDps: 155000,
    poolIlvl: 292,
    poolIlvlCount: 900,
    ...over,
  };
}

function result(over: { dps?: number; comparability?: Partial<Comparability> } = {}): BossResult {
  return {
    encounter: 'Ulgrax',
    encounterId: 2902,
    specId: 63,
    difficulty: 5,
    character: {
      dps: over.dps ?? 100000,
      context: null,
      stats: { name: 'Zaknafein', avgIlvl: 284 },
    },
    sample: [sample(125000)],
    topPlayers: [],
    comparability: comparability(over.comparability),
  } as unknown as BossResult;
}

describe('buildShareCard', () => {
  it('carries the two gaps, signed, and the ilvl of each population', () => {
    const card = buildShareCard(result());

    expect(card).not.toBeNull();
    expect(card!.myDps).toBe(100000);
    expect(card!.myIlvl).toBe(284);
    // Le chiffre de référence de l'étape : 55k contre le vivier, 25k contre les comparables.
    expect(card!.poolGapDps).toBe(55000);
    expect(card!.referenceGapDps).toBe(25000);
    expect(card!.poolIlvl).toBe(292);
    expect(card!.referenceIlvl).toBe(285);
    expect(card!.poolCount).toBe(942);
    expect(card!.referenceCount).toBe(1);
  });

  it('names the player, the spec and the difficulty', () => {
    const card = buildShareCard(result());

    expect(card!.player).toBe('Zaknafein');
    expect(card!.difficulty).toBe('Mythic');
    expect(card!.spec).toBe('Fire Mage');
    expect(card!.encounter).toBe('Ulgrax');
  });

  it('signs a gap the other way when the subject is ahead', () => {
    const card = buildShareCard(result({ dps: 200000 }));

    expect(card!.poolGapDps).toBe(-45000);
    expect(card!.referenceGapDps).toBe(-75000);
  });

  // Ce que le verdict refuse de chiffrer, la carte refuse de publier : elle circule hors de
  // son contexte, donc elle ne peut porter aucune réserve.
  it.each([
    ['not comparable', { level: 'poor' as const }],
    ['no comparable log', { level: 'none' as const }],
    ['a substituted panel', { substituted: 1 }],
  ])('refuses to exist on %s', (_label, over) => {
    expect(buildShareCard(result({ comparability: over }))).toBeNull();
  });

  it('refuses to exist without the pool it is built to demonstrate', () => {
    expect(buildShareCard(result({ comparability: { poolDps: null } }))).toBeNull();
    expect(buildShareCard(result({ comparability: { poolIlvl: null } }))).toBeNull();
    expect(buildShareCard(result({ comparability: { referenceIlvl: null } }))).toBeNull();
  });
});
