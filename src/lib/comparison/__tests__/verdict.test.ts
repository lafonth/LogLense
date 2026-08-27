import type { FightContext } from '@/lib/wcl/fight-context';
import type { BossResult, Comparability, ReferenceSample, TopPlayer } from '@/types';
import { describe, expect, it } from 'vitest';
import { buildVerdict } from '../verdict';

function sample(dps: number, qualified = true): ReferenceSample {
  return {
    name: `Ref${dps}`,
    code: 'R1',
    fightID: 1,
    actorId: 1,
    stats: { avgIlvl: 285 } as ReferenceSample['stats'],
    dps,
    killTimeMs: 300000,
    qualified,
    tierPieces: 2,
    externalUptime: 0,
    explored: false,
  };
}

function topPlayer(dps: number): TopPlayer {
  return { stats: { dps } } as TopPlayer;
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
    poolDps: null,
    poolIlvl: null,
    poolIlvlCount: 0,
    ...over,
  };
}

function result(over: {
  dps?: number;
  sample?: ReferenceSample[];
  topPlayers?: TopPlayer[];
  comparability?: Partial<Comparability>;
  context?: FightContext | null;
}): BossResult {
  return {
    character: { dps: over.dps ?? 100000, context: over.context ?? null },
    sample: over.sample ?? [sample(120000)],
    topPlayers: over.topPlayers ?? [],
    comparability: comparability(over.comparability),
  } as BossResult;
}

describe('buildVerdict', () => {
  it('chiffre la marge quand les références sont devant', () => {
    const verdict = buildVerdict(
      result({ dps: 100000, sample: [sample(115000), sample(120000), sample(130000)] })
    );

    expect(verdict).toMatchObject({ kind: 'gap', referenceDps: 120000, deltaDps: 20000 });
  });

  it("retourne la phrase quand c'est le joueur qui est devant", () => {
    const verdict = buildVerdict({
      ...result({ dps: 130000, sample: [sample(120000)] }),
    });

    expect(verdict).toMatchObject({ kind: 'ahead', deltaDps: 10000 });
  });

  it('écarte de la médiane les candidats disqualifiés, qui ont été plus aidés', () => {
    const verdict = buildVerdict(
      result({ sample: [sample(120000), sample(180000, false), sample(180000, false)] })
    );

    expect(verdict.referenceDps).toBe(120000);
  });

  it("retombe sur les topPlayers quand l'échantillon est vide", () => {
    const verdict = buildVerdict({
      ...result({ dps: 100000, sample: [], topPlayers: [topPlayer(110000)] }),
    });

    expect(verdict).toMatchObject({ kind: 'gap', referenceDps: 110000, deltaDps: 10000 });
  });

  it("n'annonce aucun écart quand la comparaison est trop lointaine", () => {
    const verdict = buildVerdict(result({ comparability: { level: 'poor' } }));

    expect(verdict.kind).toBe('unreliable');
    expect(verdict.deltaDps).toBeNull();
  });

  it("n'annonce aucun écart quand le panel a été complété par des repêchés", () => {
    // Le repli force déjà `level` à `poor` en amont ; le verdict ne s'y fie pas.
    const verdict = buildVerdict(result({ comparability: { level: 'close', substituted: 1 } }));

    expect(verdict.kind).toBe('unreliable');
    expect(verdict.deltaDps).toBeNull();
  });

  it("dit qu'il n'y a rien à comparer plutôt que de comparer à rien", () => {
    const verdict = buildVerdict(
      result({ sample: [], topPlayers: [], comparability: { level: 'none', referenceIlvl: null } })
    );

    expect(verdict).toMatchObject({ kind: 'none', referenceDps: null, deltaDps: null });
  });

  it("signe l'écart d'ilvl vers le haut, et le garde à un décimal", () => {
    const verdict = buildVerdict(
      result({ comparability: { referenceIlvl: 292.14, myIlvl: 284.1, level: 'poor' } })
    );

    expect(verdict.ilvlGap).toBe(8);
  });

  // L'effectif est celui de la population du chiffre, pas celui des ilvl : un panel de trois
  // dont une seule porte un ilvl donnerait deux effectifs différents pour la même phrase.
  it('compte les références sur lesquelles le chiffre est pris', () => {
    const verdict = buildVerdict(
      result({ sample: [sample(115000), sample(120000), sample(130000)] })
    );

    expect(verdict.referenceCount).toBe(3);
  });

  it('ne compte pas les disqualifiés écartés de la médiane', () => {
    const verdict = buildVerdict(
      result({ sample: [sample(120000), sample(180000, false), sample(180000, false)] })
    );

    expect(verdict).toMatchObject({ referenceCount: 1, allEligible: true });
  });

  // Le second repli, celui que `substituted === 0` ne voit pas : personne n'a qualifié, la
  // médiane est prise sur des disqualifiés faute de mieux.
  it('ne certifie rien quand la médiane est prise sur des disqualifiés', () => {
    const verdict = buildVerdict(
      result({ sample: [sample(180000, false), sample(190000, false)] })
    );

    expect(verdict).toMatchObject({ referenceCount: 2, allEligible: false });
  });

  it('ne certifie rien quand le panel a été complété par des repêchés', () => {
    const verdict = buildVerdict(result({ comparability: { substituted: 1 } }));

    expect(verdict.allEligible).toBe(false);
  });

  it("signe l'écart de kill time en pourcents de ma durée", () => {
    const verdict = buildVerdict(result({}));

    expect(verdict.killTimeGapPct).toBe(1.7);
  });

  // Une durée nulle n'est pas une pull de zéro seconde, c'est une durée qu'on n'a pas.
  it('se tait sur le kill time quand ma durée est absente', () => {
    const verdict = buildVerdict(result({ comparability: { myKillTimeMs: 0 } }));

    expect(verdict.killTimeGapPct).toBeNull();
  });

  it('porte sa réserve quand la comparabilité est approximative', () => {
    const verdict = buildVerdict(result({ comparability: { level: 'approximate' } }));

    expect(verdict).toMatchObject({ kind: 'gap', approximate: true });
  });

  it('porte la part de combat jouée quand le sujet est mort tôt', () => {
    const verdict = buildVerdict(
      result({
        context: { deaths: 1, subjectDied: true, subjectDeathMs: 186_000, wipesBefore: 0 },
        comparability: { myKillTimeMs: 300_000 },
      })
    );

    expect(verdict.earlyDeathPct).toBe(62);
  });

  it("ne dit rien de l'amputation quand il n'y a pas de contexte", () => {
    expect(buildVerdict(result({})).earlyDeathPct).toBeNull();
  });

  it("laisse le niveau de comparabilité intact : la cohorte n'a pas bougé", () => {
    const verdict = buildVerdict(
      result({
        context: { deaths: 1, subjectDied: true, subjectDeathMs: 30_000, wipesBefore: 0 },
        comparability: { myKillTimeMs: 300_000 },
      })
    );

    expect(verdict).toMatchObject({ kind: 'gap', earlyDeathPct: 10 });
  });
});
