import type { BossResult, ReferenceProvenance, ReferenceSample, TopPlayer } from '@/types';
import { describe, expect, it } from 'vitest';
import { buildExposure, exposureMonthKey } from '../exposure';

/** Les noms sont volontairement distinctifs : c'est sur eux que porte le test d'absence. */
const SUBJECT_NAME = 'Zephyrandra';
const REFERENCE_NAMES = ['Quillonax', 'Vondrimmel', 'Threxalune', 'Morvakeen'];

function provenance(name: string, i: number, over: Partial<ReferenceProvenance> = {}) {
  return {
    code: `code-${i}`,
    fightID: i,
    actorId: 40 + i,
    name,
    ilvl: 285,
    killTimeMs: 317924,
    dps: 123456,
    distance: 0.1 * i,
    disqualifiedBy: [],
    tierPieces: 4,
    externalUptime: 0,
    explored: false,
    ...over,
  } satisfies ReferenceProvenance;
}

function topPlayer(name: string, i: number, over: Partial<ReferenceProvenance> = {}): TopPlayer {
  return {
    stats: {
      name,
      avgIlvl: 285,
      primaryStat: 0,
      crit: 0,
      haste: 0,
      mastery: 0,
      vers: 0,
      talents: {},
      dps: 123456,
      killTime: '5:17',
    },
    rotation: { name, dps: 123456, fightDurationMs: 317924, casts: {}, buffs: {}, opening: [] },
    damageTable: { entries: [] },
    provenance: provenance(name, i, over),
  };
}

function sampleEntry(name: string, i: number, qualified = true, explored = false): ReferenceSample {
  return {
    name,
    code: `code-${i}`,
    fightID: i,
    actorId: 40 + i,
    stats: {
      name,
      avgIlvl: 285,
      primaryStat: 0,
      crit: 0,
      haste: 0,
      mastery: 0,
      vers: 0,
      talents: {},
    },
    dps: 123456,
    killTimeMs: 317924,
    qualified,
    explored,
  };
}

function result(over: Partial<BossResult> = {}): BossResult {
  return {
    renderId: 'render-1',
    encounter: 'Vorasius',
    encounterId: 3177,
    difficulty: 5,
    specId: 103,
    fightTargets: [],
    character: {
      stats: {
        name: SUBJECT_NAME,
        avgIlvl: 284.1,
        primaryStat: 0,
        crit: 0,
        haste: 0,
        mastery: 0,
        vers: 0,
        talents: {},
      },
      rotation: {
        name: SUBJECT_NAME,
        dps: 105538,
        fightDurationMs: 326876,
        casts: {},
        buffs: {},
        opening: [],
      },
      damageTable: { entries: [] },
      dps: 105538,
      bossDps: null,
      killTime: '5:26',
      overallPct: 95.5,
      overallPctOf: 1000,
      todayPct: 92.1,
      bossDpsPct: null,
      bracket: 0,
      source: { code: 'abc', fightID: 17, actorId: 63 },
      trajectory: [],
      eligibility: { tierPieces: 4, externalUptime: 0, externals: [] },
      context: null,
    },
    topPlayers: REFERENCE_NAMES.slice(0, 3).map((n, i) => topPlayer(n, i + 1)),
    sample: REFERENCE_NAMES.map((n, i) => sampleEntry(n, i + 1, i !== 3)),
    comparability: {
      level: 'close',
      referenceIlvl: 285,
      myIlvl: 284.1,
      referenceKillTimeMs: 317924,
      myKillTimeMs: 326876,
      candidatesConsidered: 981,
      pagesFetched: 10,
      disqualified: 2,
      unverifiable: 0,
      substituted: 1,
    },
    ...over,
  };
}

const ARGS = { by: 'hash', at: '2026-08-07T09:14:22.000Z', dpsSource: 'ranking' as const };

describe('buildExposure', () => {
  it('writes the whole verified window, not only the panel', () => {
    const record = buildExposure(result(), ARGS);

    expect(record.references).toHaveLength(4);
    expect(record.references.map((r) => r.actorId)).toEqual([41, 42, 43, 44]);
    expect(record.references.map((r) => r.qualified)).toEqual([true, true, true, false]);
  });

  // Le point le plus facile à rater : un « montrée, non contestée » lu sur une entrée qui
  // n'avait pas de bouton serait un positif fabriqué.
  it('marks as contestable only the references the screen let the user challenge', () => {
    const record = buildExposure(result(), ARGS);

    expect(record.references.map((r) => r.contestable)).toEqual([true, true, true, false]);
    expect(record.references.map((r) => r.rank)).toEqual([1, 2, 3, null]);
  });

  it('takes the distance from the panel, and leaves it null off the panel', () => {
    const record = buildExposure(result(), ARGS);

    expect(record.references[0].distance).toBeCloseTo(0.1, 5);
    expect(record.references[3].distance).toBeNull();
  });

  // Une distance non calculable n'est pas une distance immense : on la nomme ici plutôt que
  // de la laisser à `JSON.stringify`, qui la rendrait `null` sans que ce soit une décision.
  it('records an infinite distance as null', () => {
    const r = result();
    r.topPlayers[0].provenance.distance = Number.POSITIVE_INFINITY;

    expect(buildExposure(r, ARGS).references[0].distance).toBeNull();
  });

  // Elle vient de l'échantillon, pas du panel : une entrée tirée que la sélection a écartée
  // de l'affichage doit rester marquée, sinon le corpus la relit comme un choix de la règle.
  it('marks the explored entry wherever it sits, panel or not', () => {
    const r = result({
      sample: [
        sampleEntry(REFERENCE_NAMES[0], 1),
        sampleEntry(REFERENCE_NAMES[1], 2, true, true),
        sampleEntry(REFERENCE_NAMES[2], 3),
        sampleEntry(REFERENCE_NAMES[3], 4, false, true),
      ],
    });

    expect(buildExposure(r, ARGS).references.map((e) => e.explored)).toEqual([
      false,
      true,
      false,
      true,
    ]);
  });

  it('carries the disqualification verdicts of the panel', () => {
    const r = result();
    r.topPlayers[1].provenance.disqualifiedBy = ['set-bonus', 'external'];

    const record = buildExposure(r, ARGS);
    expect(record.references[1].disqualifiedBy).toEqual(['set-bonus', 'external']);
    expect(record.references[0].disqualifiedBy).toEqual([]);
  });

  // §5c des CGU : le corpus ne conserve aucun contenu de tiers. Le pointeur remplace le nom.
  it('puts no character name anywhere in the record', () => {
    const serialized = JSON.stringify(buildExposure(result(), ARGS));

    for (const name of [SUBJECT_NAME, ...REFERENCE_NAMES]) {
      expect(serialized).not.toContain(name);
    }
  });

  // Aucune mesure WCL recopiée : seulement les identifiants et ce que LogLense a calculé.
  it('copies no WCL measure onto a reference', () => {
    const record = buildExposure(result(), ARGS);

    for (const reference of record.references) {
      expect(Object.keys(reference).sort()).toEqual([
        'actorId',
        'code',
        'contestable',
        'disqualifiedBy',
        'distance',
        'explored',
        'fightID',
        'qualified',
        'rank',
      ]);
    }
  });

  it('carries the comparability snapshot in full', () => {
    const r = result();
    expect(buildExposure(r, ARGS).comparability).toEqual(r.comparability);
  });

  it('names the render, the subject and how its dps was measured', () => {
    const record = buildExposure(result(), { ...ARGS, dpsSource: 'damage-table' });

    expect(record.v).toBe(4);
    expect(record.kind).toBe('exposure');
    expect(record.renderId).toBe('render-1');
    expect(record.by).toBe('hash');
    expect(record.at).toBe(ARGS.at);
    expect(record.subject).toEqual({
      code: 'abc',
      fightID: 17,
      actorId: 63,
      dpsSource: 'damage-table',
      eligibility: { tierPieces: 4, externalUptime: 0, externals: [] },
      context: null,
    });
    expect(record).toMatchObject({ encounterId: 3177, difficulty: 5, specId: 103 });
  });

  // Le verdict « pas comparable » sur le set bonus ne se relit pas sans le palier du sujet :
  // c'est la moitié du corpus qui manquait.
  it("carries the subject's own eligibility and pull context", () => {
    const record = buildExposure(
      result({
        character: {
          ...result().character,
          eligibility: { tierPieces: 2, externalUptime: 31, externals: ['Power Infusion'] },
          context: { deaths: 3, subjectDied: true, subjectDeathMs: 128_000, wipesBefore: 7 },
        },
      }),
      ARGS
    );

    expect(record.subject.eligibility).toEqual({
      tierPieces: 2,
      externalUptime: 31,
      externals: ['Power Infusion'],
    });
    expect(record.subject.context).toEqual({
      deaths: 3,
      subjectDied: true,
      subjectDeathMs: 128_000,
      wipesBefore: 7,
    });
  });

  // La copie doit être une copie : le corpus est écrit, puis relu longtemps après.
  it('copies the mutable parts of the subject rather than aliasing them', () => {
    const r = result();
    const record = buildExposure(r, ARGS);

    expect(record.subject.eligibility).not.toBe(r.character.eligibility);
    expect(record.subject.eligibility.externals).not.toBe(r.character.eligibility.externals);
  });

  // Un rendu sans référence est lui aussi une exposition : il dit que le vivier n'a rien donné.
  it('still produces a record when no reference was shown', () => {
    const record = buildExposure(result({ topPlayers: [], sample: [] }), { ...ARGS, by: null });

    expect(record.references).toEqual([]);
    expect(record.by).toBeNull();
  });
});

describe('exposureMonthKey', () => {
  it('gives the month its own list', () => {
    expect(exposureMonthKey('2026-08-07T09:14:22.000Z')).toBe('labels:exposure:2026-08');
  });
});
