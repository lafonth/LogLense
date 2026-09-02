import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isBossResult } from '../../boss-outcome';
import { findCombatantByName } from '../combatant';
import { fetchFightData } from '../fight-data';
import { analyzeBoss } from '../pipeline';
import { fetchCandidatePool } from '../references';
import { analyzeReportBoss } from '../report-pipeline';

/**
 * Une charge unique qui sert les deux chemins : le chemin personnage lit `characterData`,
 * le chemin rapport lit `reportData`. Ce qui est testé ici n'est ni l'un ni l'autre, c'est
 * l'identifiant de rendu — tout le reste est réduit au minimum qui laisse passer.
 */
const fixtures = vi.hoisted(() => ({
  gqlPayload: {
    characterData: {
      character: {
        dps: {
          ranks: [
            {
              amount: 250000,
              duration: 180000,
              rankPercent: 95.5,
              todayPercent: 92.1,
              bracketData: 0,
              rankTotalParses: 1000,
              report: { code: 'abc', fightID: 17 },
            },
          ],
        },
        boss: { ranks: [] },
      },
    },
    reportData: { report: { rankings: { data: [] } } },
  },
  combatant: { sourceID: 63, specID: 103, gear: [] },
  fightData: {
    stats: {
      name: 'Jumbaa',
      avgIlvl: 635,
      primaryStat: 13200,
      crit: 3890,
      haste: 3500,
      mastery: 5800,
      vers: 750,
      talents: {},
    },
    rotation: {
      name: 'Jumbaa',
      dps: 250000,
      fightDurationMs: 180000,
      casts: {},
      buffs: {},
      opening: [],
    },
    damageEntries: [],
    fightTargets: [],
    dps: 250000,
    eligibility: { tierPieces: 4, externalUptime: 0, externals: [] },
  },
  references: {
    topPlayers: [],
    sample: [],
    comparability: {
      level: 'close',
      referenceIlvl: 636,
      myIlvl: 635,
      referenceKillTimeMs: 178000,
      myKillTimeMs: 180000,
      candidatesConsidered: 0,
      pagesFetched: 0,
      disqualified: 0,
      substituted: 0,
      poolDps: null,
      poolIlvl: null,
      poolIlvlCount: 0,
    },
  },
}));

vi.mock('../client', () => ({
  gql: vi.fn().mockResolvedValue(fixtures.gqlPayload),
}));

vi.mock('../combatant', () => ({
  findCombatantByName: vi.fn().mockResolvedValue(fixtures.combatant),
  fetchReportCombatants: () => ({ byActor: vi.fn().mockResolvedValue(fixtures.combatant) }),
}));

vi.mock('../fight-data', () => ({
  fetchFightData: vi.fn().mockResolvedValue(fixtures.fightData),
}));

vi.mock('../references', () => ({
  fetchCandidatePool: vi.fn().mockResolvedValue({ candidates: [], pagesFetched: 0 }),
  resolveReferences: vi.fn().mockResolvedValue(fixtures.references),
}));

const INPUT = {
  characterName: 'Jumbaa',
  serverSlug: 'ysondre',
  region: 'EU' as const,
  difficulty: 5 as const,
  encounters: [{ id: 3306, name: 'Chimaerus' }],
  specId: 103,
};

/**
 * Les deux chemins, réduits à leur rendu : les suites ci-dessous lisent `renderId` et
 * `character`, qu'un refus ne porte pas. Le refus a sa propre suite, tout en bas.
 */
async function charBoss(input: typeof INPUT = INPUT) {
  const outcome = await analyzeBoss('token', input, 3306, 'Chimaerus');
  return isBossResult(outcome) ? outcome : null;
}

async function reportBoss() {
  const outcome = await analyzeReportBoss(
    'token',
    'abc',
    3306,
    'Chimaerus',
    63,
    'Jumbaa',
    17,
    180000,
    5
  );
  return isBossResult(outcome) ? outcome : null;
}

describe('renderId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Un verdict « pas comparable » se rattache à ce qui a été montré. Sans identifiant sur
  // le rendu, un refus ne peut être ni rattaché ni dédupliqué.
  it('is carried by the character path, and renewed at each analysis', async () => {
    const first = await charBoss();
    const second = await charBoss();

    expect(first?.renderId).toBeTruthy();
    expect(second?.renderId).toBeTruthy();
    // Ré-analyser le même combat est une nouvelle exposition, pas un doublon.
    expect(first?.renderId).not.toBe(second?.renderId);
  });

  it('is carried by the report path, and renewed at each analysis', async () => {
    const first = await reportBoss();
    const second = await reportBoss();

    expect(first?.renderId).toBeTruthy();
    expect(first?.renderId).not.toBe(second?.renderId);
  });

  // Les deux chemins alimentent le même corpus : deux rendus ne doivent jamais se confondre,
  // même produits par des chemins différents.
  it('does not collide across the two paths', async () => {
    const character = await charBoss();
    const report = await reportBoss();

    expect(character?.renderId).not.toBe(report?.renderId);
  });
});

// L'écart affiché soustrait le DPS du sujet à celui des références, et `references.ts` prend
// toujours le montant des classements WCL. Les deux chemins doivent donc mesurer le sujet à la
// même règle — c'est l'invariant qui manquait, et que le chemin rapport enfreignait.
describe('dps provenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('measures the character path with the rankings amount, never the damage table', async () => {
    const result = await charBoss();

    expect(vi.mocked(fetchFightData).mock.calls[0]?.[1]).toMatchObject({ dps: 250000 });
    expect(result?.character.dpsSource).toBe('ranking');
  });
});

// Le défaut d'origine : une Prêtre Sacré comparée à des Ombre. Le formulaire annonçait une
// spec de dégâts, le log en montrait une autre, et le rapport rendu était cohérent et
// entièrement faux. C'est le log qui gagne, et le refus tombe avant le premier candidat.
describe('unsupported spec', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('believes the log over the form, and refuses before building a pool', async () => {
    // 257 = Prêtre Sacré dans le log ; 258 = Ombre dans le formulaire, une spec que nous
    // classons — c'est elle qui faisait passer la garde.
    vi.mocked(findCombatantByName).mockResolvedValue({
      ...fixtures.combatant,
      specID: 257,
    } as never);

    const outcome = await analyzeBoss('token', { ...INPUT, specId: 258 }, 3306, 'Chimaerus');

    expect(outcome).toMatchObject({ refused: 'unsupported-spec', specId: 257 });
    // Un refus qui a déjà coûté cinquante requêtes WCL est un refus mal placé.
    expect(vi.mocked(fetchCandidatePool)).not.toHaveBeenCalled();
    // Et surtout : aucun vivier d'Ombre n'a été constitué sous le nom d'une Sacré.
    expect(isBossResult(outcome)).toBe(false);
  });
});
