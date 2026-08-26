import type { Finding } from '../findings';
import type { BossResult, DamageEntry, TalentNode } from '@/types';
import { describe, expect, it } from 'vitest';
import { buildFindings, MAX_OPPORTUNITIES } from '../findings';
import { leadingGap } from '../leading-gap';

const GUIDS: Record<string, number> = {
  Starfall: 191037,
  Wrath: 190984,
  Starfire: 194153,
  Moonfire: 8921,
};
const guidOf = (name: string) => GUIDS[name] ?? 0;

/** Quatre minutes : deux lancers d'écart valent 0,5/min, le seuil de `isNameableGap`. */
const FIGHT_MS = 240_000;

const damage = (totals: Record<string, number>): DamageEntry[] =>
  Object.entries(totals).map(([name, total]) => ({ guid: guidOf(name), name, total }));

const castsOf = (perMin: Record<string, number>) =>
  Object.fromEntries(
    Object.entries(perMin).map(([name, v]) => [
      name,
      { guid: guidOf(name), casts: Math.round(v * (FIGHT_MS / 60_000)), perMin: v },
    ])
  );

const openingOf = (names: string[]) =>
  names.map((name, index) => ({ guid: guidOf(name), name, offsetMs: index * 1_500 }));

interface RefSpec {
  dps: number;
  damage: Record<string, number>;
  casts: Record<string, number>;
  buffs?: Record<string, number>;
  opening?: string[];
}

interface SampleSpec {
  dps: number;
  qualified?: boolean;
  talents?: Record<number, number>;
}

interface Over {
  dps?: number;
  damage?: Record<string, number>;
  casts?: Record<string, number>;
  buffs?: Record<string, number>;
  opening?: string[];
  talents?: Record<number, number>;
  references?: RefSpec[];
  sample?: SampleSpec[];
  level?: BossResult['comparability']['level'];
  substituted?: number;
}

/**
 * Le cas de base est un verdict `gap` : 100 000 dps contre 120 000, panel de deux références
 * lisibles. Wrath tombe dans la fourchette de cadence, Starfall en sort largement — de quoi
 * exercer les deux issues de `causeFor` sur le même log.
 */
const REFERENCES: RefSpec[] = [
  {
    dps: 120_000,
    damage: { Wrath: 800, Starfall: 200 },
    casts: { Wrath: 20.5, Starfall: 3.0 },
    buffs: { 'Moonkin Form': 100 },
    opening: ['Starfire', 'Starfall'],
  },
  {
    dps: 120_000,
    damage: { Wrath: 800, Starfall: 200 },
    casts: { Wrath: 19.5, Starfall: 3.5 },
    buffs: { 'Moonkin Form': 100 },
    opening: ['Starfire', 'Starfall'],
  },
];

function result(over: Over = {}): BossResult {
  const sample: SampleSpec[] = over.sample ?? [{ dps: 120_000 }, { dps: 120_000 }];
  const references = over.references ?? REFERENCES;

  return {
    character: {
      dps: over.dps ?? 100_000,
      damageTable: { entries: damage(over.damage ?? { Wrath: 990, Starfall: 10 }) },
      stats: { talents: over.talents ?? {} },
      context: null,
      rotation: {
        name: 'Me',
        fightDurationMs: FIGHT_MS,
        casts: castsOf(over.casts ?? { Wrath: 20, Starfall: 1.0 }),
        buffs: over.buffs ?? { 'Moonkin Form': 100 },
        opening: openingOf(over.opening ?? ['Starfire', 'Wrath']),
      },
    },
    topPlayers: references.map((ref) => ({
      stats: { dps: ref.dps },
      damageTable: { entries: damage(ref.damage) },
      rotation: {
        name: 'Ref',
        fightDurationMs: FIGHT_MS,
        casts: castsOf(ref.casts),
        buffs: ref.buffs ?? {},
        opening: openingOf(ref.opening ?? []),
      },
    })),
    sample: sample.map((entry, index) => ({
      name: `Ref${index}`,
      dps: entry.dps,
      qualified: entry.qualified ?? true,
      stats: { talents: entry.talents ?? {} },
    })),
    comparability: {
      level: over.level ?? 'good',
      substituted: over.substituted ?? 0,
      referenceIlvl: 640,
      referenceIlvlCount: references.length,
      myIlvl: 638,
      referenceKillTimeMs: FIGHT_MS,
      myKillTimeMs: FIGHT_MS,
      candidatesConsidered: 20,
      pagesFetched: 1,
      disqualified: 0,
      unverifiable: 0,
    },
  } as unknown as BossResult;
}

const damageRows = (findings: ReturnType<typeof buildFindings>) =>
  findings.opportunities.filter(
    (f): f is Extract<Finding, { kind: 'damage' }> => f.kind === 'damage'
  );

const rowFor = (findings: ReturnType<typeof buildFindings>, ability: string) =>
  damageRows(findings).find((f) => f.ability === ability);

describe('buildFindings', () => {
  it('names the cadence behind an ability the field converts and I do not', () => {
    const findings = buildFindings(result(), []);

    const starfall = rowFor(findings, 'Starfall');
    expect(starfall).toBeDefined();
    expect(starfall!.gapDps).toBeCloseTo(23_000);
    expect(starfall!.minePct).toBeCloseTo(1);
    expect(starfall!.fieldPct).toBeCloseTo(20);
    expect(starfall!.cause).toEqual({
      kind: 'cast',
      mine: 1.0,
      referenceMin: 3.0,
      referenceMax: 3.5,
    });
  });

  it('keeps the line but names no cause when my cadence is inside the field range', () => {
    // Le cœur de l'écran : l'écart de dégâts est mesuré, la cause est une hypothèse. Wrath à
    // 20/min contre une fourchette [19,5 ; 20,5] ne donne aucun droit de nommer une cause,
    // et pourtant ses dégâts diffèrent — la ligne doit rester, sans cause.
    const findings = buildFindings(result(), []);

    const wrath = rowFor(findings, 'Wrath');
    expect(wrath).toBeDefined();
    expect(wrath!.gapDps).toBeCloseTo(-3_000);
    expect(wrath!.cause).toBeNull();
  });

  it('ranks the widest gap first', () => {
    expect(damageRows(buildFindings(result(), [])).map((f) => f.ability)).toEqual([
      'Starfall',
      'Wrath',
    ]);
  });

  // Le seul invariant qui tienne les deux écrans ensemble : la phrase de la bannière et la
  // première ligne de l'onglet nomment le même sort. Ils se sont contredits — la bannière
  // triait par déviation pondérée, la liste par écart de dps — sur ce jeu de données même :
  // Starfall en tête du classement en dps, Wrath en tête de la pondération.
  it('names the same ability as the banner', () => {
    const r = result();

    expect(damageRows(buildFindings(r, []))[0].ability).toBe(leadingGap(r)?.ability);
    expect(leadingGap(r)?.ability).toBe('Starfall');
  });

  it('drops a line below the 1 % noise floor', () => {
    const findings = buildFindings(
      result({
        damage: { Wrath: 985, Starfall: 10, Starfire: 5 },
        references: REFERENCES.map((ref) => ({
          ...ref,
          damage: { Wrath: 795, Starfall: 200, Starfire: 5 },
        })),
      }),
      []
    );

    // Starfire : 0,5 % contre 0,5 %, soit 100 dps d'écart sur un plancher à 1 000.
    expect(rowFor(findings, 'Starfire')).toBeUndefined();
    expect(rowFor(findings, 'Starfall')).toBeDefined();
  });

  it('shows no dps figure at all when the verdict is unreliable', () => {
    const findings = buildFindings(result({ level: 'poor' }), []);

    expect(findings.opportunities).toEqual([]);
    // Une divergence d'ouverture est un fait sur les logs qu'on a, pas une quantité dérivée
    // de l'écart de dps qu'on s'interdit d'énoncer : elle reste.
    expect(findings.diagnostics.some((f) => f.kind === 'opening')).toBe(true);
  });

  it('shows no dps figure either when the verdict is none', () => {
    expect(buildFindings(result({ level: 'none' }), []).opportunities).toEqual([]);
  });

  it('stays silent on dps when a substituted reference propped the panel up', () => {
    expect(buildFindings(result({ substituted: 1 }), []).opportunities).toEqual([]);
  });

  it('refuses to quantify against a single reference', () => {
    const findings = buildFindings(result({ references: [REFERENCES[0]] }), []);

    expect(findings.opportunities).toEqual([]);
    expect(findings.diagnostics.some((f) => f.kind === 'opening')).toBe(false);
  });

  it('counts every ability and uptime that sits inside the field range', () => {
    // Wrath dans sa fourchette de cadence, Moonkin Form dans la sienne : deux. Starfall en
    // sort, et le compte doit être celui que `RotationCards` repliera.
    expect(buildFindings(result(), []).matching).toBe(2);
  });

  it('caps the list at MAX_OPPORTUNITIES', () => {
    const spread = { A: 10, B: 10, C: 10, D: 10, E: 10, F: 10 };
    const findings = buildFindings(
      result({
        damage: { Wrath: 940, ...spread },
        references: REFERENCES.map((ref) => ({
          ...ref,
          damage: { Wrath: 400, A: 100, B: 100, C: 100, D: 100, E: 100, F: 100 },
        })),
      }),
      []
    );

    expect(findings.opportunities).toHaveLength(MAX_OPPORTUNITIES);
  });

  it('reports where my opening leaves the majority', () => {
    const opening = buildFindings(result(), []).diagnostics.find((f) => f.kind === 'opening');

    expect(opening).toEqual({
      kind: 'opening',
      divergesAtRank: 2,
      mine: 'Wrath',
      consensus: 'Starfall',
      consensusCount: 2,
      referenceTotal: 2,
    });
  });

  it('says nothing about the opening when I match the consensus', () => {
    const findings = buildFindings(result({ opening: ['Starfire', 'Starfall'] }), []);

    expect(findings.diagnostics.some((f) => f.kind === 'opening')).toBe(false);
  });

  it('reports a build node the field takes and one only I take', () => {
    const nodes: TalentNode[] = [
      node({ id: 1, talentIds: [101], name: 'Starlord', row: 1, col: 1 }),
      node({ id: 2, talentIds: [201], name: 'Soul of the Forest', row: 2, col: 1 }),
    ];

    const findings = buildFindings(
      result({
        talents: { 201: 1 },
        sample: [
          { dps: 120_000, talents: { 101: 1 } },
          { dps: 120_000, talents: { 101: 1 } },
          { dps: 120_000, talents: { 101: 1 } },
        ],
      }),
      nodes
    );

    expect(findings.diagnostics.filter((f) => f.kind === 'talent')).toEqual([
      {
        kind: 'talent',
        label: 'Starlord',
        direction: 'missed',
        referenceCount: 3,
        referenceTotal: 3,
      },
      {
        kind: 'talent',
        label: 'Soul of the Forest',
        direction: 'unique',
        referenceCount: 0,
        referenceTotal: 3,
      },
    ]);
  });

  it('hides a build node only a minority of the field takes', () => {
    const nodes: TalentNode[] = [
      node({ id: 1, talentIds: [101], name: 'Starlord', row: 1, col: 1 }),
    ];

    const findings = buildFindings(
      result({
        talents: {},
        sample: [
          { dps: 120_000, talents: { 101: 1 } },
          { dps: 120_000, talents: {} },
          { dps: 120_000, talents: {} },
        ],
      }),
      nodes
    );

    expect(findings.diagnostics.some((f) => f.kind === 'talent')).toBe(false);
  });
});

function node(over: {
  id: number;
  talentIds: number[];
  name: string;
  row: number;
  col: number;
}): TalentNode {
  return {
    id: over.id,
    talentIds: over.talentIds,
    name: over.name,
    names: over.talentIds.map(() => over.name),
    spellId: over.talentIds[0],
    row: over.row,
    col: over.col,
    maxRanks: 1,
    nodeType: 'single',
    treeType: 'spec',
    children: [],
  };
}
