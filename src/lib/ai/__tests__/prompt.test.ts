import type { TrajectoryPoint } from '@/lib/wcl/trajectory';
import type { AnalysisResult, BossResult, ReferenceSample } from '@/types';
import { describe, expect, it } from 'vitest';
import { buildAnalysisPrompt, coveredAxes, PROMPT_AXES, SYSTEM_PROMPT } from '../prompt';

/**
 * La fenêtre vérifiée est plus large que les trois références chères : c'est sur elle que
 * se lisent stats et talents. Trois entrées suffisent à donner min, médiane et max distincts.
 */
function sampleEntry(
  name: string,
  avgIlvl: number,
  dps: number,
  talents: Record<number, number>,
  qualified = true
): ReferenceSample {
  return {
    name,
    code: `code-${name}`,
    fightID: 4,
    actorId: 4,
    stats: {
      name,
      avgIlvl,
      primaryStat: 13800,
      crit: 4100,
      haste: 3600,
      mastery: 5900,
      vers: 800,
      talents,
    },
    dps,
    killTimeMs: 175000,
    qualified,
    tierPieces: 2,
    externalUptime: 0,
    explored: false,
  };
}

function makeBoss(overrides: Partial<BossResult['character']> = {}): BossResult {
  return {
    renderId: 'render-1',
    encounter: 'Chimaerus',
    encounterId: 3306,
    specId: 103,
    difficulty: 5,
    fightTargets: [{ name: 'Chimaerus', type: 'Boss', damagePct: 95.0 }],
    character: {
      stats: {
        name: 'Jumbaa',
        avgIlvl: 635,
        primaryStat: 13200,
        crit: 3890,
        haste: 3500,
        mastery: 5800,
        vers: 750,
        talents: { 391528: 1 },
      },
      rotation: {
        name: 'Jumbaa',
        dps: 250000,
        fightDurationMs: 180000,
        casts: {
          "Tiger's Fury": { guid: 5217, casts: 10, perMin: 3.33 },
          Berserk: { guid: 106951, casts: 3, perMin: 1 },
          Shred: { guid: 5221, casts: 60, perMin: 20 },
          Rip: { guid: 1079, casts: 9, perMin: 3 },
          'Ferocious Bite': { guid: 22568, casts: 12, perMin: 4 },
        },
        buffs: { "Tiger's Fury": 28 },
        opening: [],
      },
      damageTable: {
        entries: [
          { guid: 5221, name: 'Shred', total: 5000000 },
          { guid: 1079, name: 'Rip', total: 3000000 },
        ],
      },
      dps: 250000,
      dpsSource: 'ranking',
      bossDps: null,
      killTime: '3:00',
      overallPct: 95.5,
      overallPctOf: 1000,
      todayPct: 92.1,
      bossDpsPct: null,
      bracket: 0,
      trajectory: [],
      ...overrides,
      source: { code: 'abc', fightID: 17, actorId: 63 },
      eligibility: { tierPieces: 4, externalUptime: 0, externals: [] },
      context: null,
    },
    topPlayers: [
      {
        stats: {
          name: 'TopPlayer1',
          avgIlvl: 639,
          primaryStat: 13800,
          crit: 4100,
          haste: 3600,
          mastery: 5900,
          vers: 800,
          dps: 290000,
          killTime: '2:55',
          talents: { 391528: 1, 395152: 1 },
        },
        rotation: {
          name: 'TopPlayer1',
          dps: 290000,
          fightDurationMs: 175000,
          casts: {
            "Tiger's Fury": { guid: 5217, casts: 11, perMin: 3.77 },
            Shred: { guid: 5221, casts: 65, perMin: 22.29 },
            Rip: { guid: 1079, casts: 11, perMin: 3.77 },
            'Ferocious Bite': { guid: 22568, casts: 14, perMin: 4.8 },
          },
          buffs: { "Tiger's Fury": 35 },
          opening: [],
        },
        damageTable: {
          entries: [
            { guid: 1079, name: 'Rip', total: 4000000 },
            { guid: 1822, name: 'Rake', total: 2000000 },
            { guid: 5221, name: 'Shred', total: 1500000 },
          ],
        },
        fightTargets: [],
        provenance: {
          code: 'ref1',
          fightID: 4,
          actorId: 4,
          name: 'TopPlayer1',
          ilvl: 639,
          killTimeMs: 175000,
          dps: 290000,
          distance: 0.42,
          disqualifiedBy: [],
          tierPieces: 4,
          externalUptime: 0,
          explored: false,
        },
      },
    ],
    sample: [
      sampleEntry('TopPlayer1', 639, 290000, { 391528: 1, 395152: 1 }),
      sampleEntry('TopPlayer2', 641, 305000, { 391528: 1, 395152: 1 }),
      sampleEntry('TopPlayer3', 637, 275000, { 391528: 1 }),
    ],
    comparability: {
      level: 'close',
      referenceIlvl: 636,
      referenceIlvlCount: 3,
      myIlvl: 635,
      referenceKillTimeMs: 178000,
      myKillTimeMs: 180000,
      candidatesConsidered: 500,
      pagesFetched: 5,
      disqualified: 0,
      unverifiable: 0,
      substituted: 0,
    },
  };
}

describe('buildAnalysisPrompt', () => {
  it('includes boss name and DPS', () => {
    const input: AnalysisResult = {
      input: {
        characterName: 'Jumbaa',
        serverSlug: 'ysondre',
        region: 'EU',
        difficulty: 5,
        encounters: [{ id: 3306, name: 'Chimaerus' }],
        specId: 103,
      },
      bosses: [makeBoss()],
      generatedAt: '2026-05-09T00:00:00.000Z',
    };

    const prompt = buildAnalysisPrompt(input);
    expect(prompt).toContain('Chimaerus');
    expect(prompt).toContain('250,000');
    expect(prompt).toContain('95.5');
    expect(prompt).toContain("Tiger's Fury");
    expect(prompt).toContain('Damage Breakdown');
  });

  it('skips null boss results', () => {
    const input: AnalysisResult = {
      input: {
        characterName: 'Jumbaa',
        serverSlug: 'ysondre',
        region: 'EU',
        difficulty: 5,
        encounters: [{ id: 3306, name: 'Chimaerus' }],
        specId: 103,
      },
      bosses: [null],
      generatedAt: '2026-05-09T00:00:00.000Z',
    };

    const prompt = buildAnalysisPrompt(input);
    expect(prompt).not.toContain('Chimaerus');
    expect(prompt).toContain('No data');
  });

  it('includes talent diff section', () => {
    const boss = makeBoss();
    const input: AnalysisResult = {
      input: {
        characterName: 'Jumbaa',
        serverSlug: 'ysondre',
        region: 'EU',
        difficulty: 5,
        encounters: [{ id: 3306, name: 'Chimaerus' }],
        specId: 103,
      },
      bosses: [boss],
      generatedAt: '2026-05-09T00:00:00.000Z',
    };

    const prompt = buildAnalysisPrompt(input);
    expect(prompt).toContain('Talent Differences');
  });

  it('omits the opening section entirely when no cast order is available', () => {
    const input: AnalysisResult = {
      input: {
        characterName: 'Jumbaa',
        serverSlug: 'ysondre',
        region: 'EU',
        difficulty: 5,
        encounters: [{ id: 3306, name: 'Chimaerus' }],
        specId: 103,
      },
      bosses: [makeBoss()],
      generatedAt: '2026-05-09T00:00:00.000Z',
    };

    expect(buildAnalysisPrompt(input)).not.toContain('### Opening');
  });

  it('gives the opening rank by rank and names the first divergence', () => {
    const boss = makeBoss();
    boss.character.rotation.opening = [
      { guid: 5217, name: "Tiger's Fury", offsetMs: 0 },
      { guid: 1079, name: 'Rip', offsetMs: 1500 },
    ];
    boss.topPlayers[0].rotation.opening = [
      { guid: 5217, name: "Tiger's Fury", offsetMs: 0 },
      { guid: 5221, name: 'Shred', offsetMs: 1400 },
    ];

    const input: AnalysisResult = {
      input: {
        characterName: 'Jumbaa',
        serverSlug: 'ysondre',
        region: 'EU',
        difficulty: 5,
        encounters: [{ id: 3306, name: 'Chimaerus' }],
        specId: 103,
      },
      bosses: [boss],
      generatedAt: '2026-05-09T00:00:00.000Z',
    };

    const prompt = buildAnalysisPrompt(input);
    expect(prompt).toContain('### Opening');
    expect(prompt).toContain('+1.5s');
    expect(prompt).toContain('Shred (1/1)');
    expect(prompt).toContain('leaves the reference majority at cast 2');
  });

  it('describes the stats as a distribution and names the size of the field', () => {
    const input: AnalysisResult = {
      input: {
        characterName: 'Jumbaa',
        serverSlug: 'ysondre',
        region: 'EU',
        difficulty: 5,
        encounters: [{ id: 3306, name: 'Chimaerus' }],
        specId: 103,
      },
      bosses: [makeBoss()],
      generatedAt: '2026-05-09T00:00:00.000Z',
    };

    const prompt = buildAnalysisPrompt(input);
    expect(prompt).toContain('Field median');
    expect(prompt).toContain('Field = 3 comparable logs');
    // Le partage des effectifs doit être dit : trois logs de rotation ne sont pas une population.
    expect(prompt).toContain('full comparable field (3 logs)');
    expect(prompt).toContain('1 closest of them only');
    // L'adoption d'un talent se compte sur le champ, pas sur les trois références chères.
    expect(prompt).toContain('Field size: 3 comparable logs');
  });

  it('marks the field as unreliable when no log passed the eliminatory criteria', () => {
    const boss = makeBoss();
    boss.sample = boss.sample.map((s) => ({ ...s, qualified: false }));

    const prompt = buildAnalysisPrompt({
      input: {
        characterName: 'Jumbaa',
        serverSlug: 'ysondre',
        region: 'EU',
        difficulty: 5,
        encounters: [{ id: 3306, name: 'Chimaerus' }],
        specId: 103,
      },
      bosses: [boss],
      generatedAt: '2026-05-09T00:00:00.000Z',
    });

    expect(prompt).toContain('None of these logs passed the eliminatory criteria');
  });
});

describe('comparability section', () => {
  it('names the level in the prompt', () => {
    const input: AnalysisResult = {
      input: {
        characterName: 'Jumbaa',
        serverSlug: 'ysondre',
        region: 'EU',
        difficulty: 5,
        encounters: [{ id: 3306, name: 'Chimaerus' }],
        specId: 103,
      },
      bosses: [makeBoss()],
      generatedAt: '2026-05-09T00:00:00.000Z',
    };

    const prompt = buildAnalysisPrompt(input);
    expect(prompt).toContain('Comparable');
  });

  it('instructs the model not to attribute the gap to the player on a poor comparison', () => {
    const boss = makeBoss();
    boss.comparability = { ...boss.comparability, level: 'poor' };
    const input: AnalysisResult = {
      input: {
        characterName: 'Jumbaa',
        serverSlug: 'ysondre',
        region: 'EU',
        difficulty: 5,
        encounters: [{ id: 3306, name: 'Chimaerus' }],
        specId: 103,
      },
      bosses: [boss],
      generatedAt: '2026-05-09T00:00:00.000Z',
    };

    const prompt = buildAnalysisPrompt(input);
    expect(prompt).toContain('Not comparable');
    expect(prompt).toContain('attribute the DPS gap to the difference in context');
  });

  it('does not add the caution instruction on a close comparison', () => {
    const boss = makeBoss();
    boss.comparability = { ...boss.comparability, level: 'close' };
    const input: AnalysisResult = {
      input: {
        characterName: 'Jumbaa',
        serverSlug: 'ysondre',
        region: 'EU',
        difficulty: 5,
        encounters: [{ id: 3306, name: 'Chimaerus' }],
        specId: 103,
      },
      bosses: [boss],
      generatedAt: '2026-05-09T00:00:00.000Z',
    };

    const prompt = buildAnalysisPrompt(input);
    expect(prompt).not.toContain('attribute the DPS gap to the difference in context');
  });
});

describe('system prompt', () => {
  it('exists and describes the analysis process', () => {
    expect(SYSTEM_PROMPT).toContain('WarcraftLogs');
    expect(SYSTEM_PROMPT).toContain('Damage by Target');
    expect(SYSTEM_PROMPT).toContain('Spell Usage');
  });
});

/** Une trajectoire de kills sur la même spec, du plus ancien au plus récent. */
function trajectory(
  points: Array<{ pct: number; dps?: number; bracket?: number; spec?: string }>
): TrajectoryPoint[] {
  return points.map((p, i) => ({
    at: new Date(Date.UTC(2026, 3, i + 1, 20)).toISOString(),
    dps: p.dps ?? 250000,
    rankPercent: p.pct,
    todayPercent: p.pct - 3,
    bracket: p.bracket ?? 635,
    killTimeMs: 180000,
    code: `t${i}`,
    fightID: 1,
    spec: p.spec ?? 'Feral',
    analysed: i === points.length - 1,
  }));
}

function resultWith(boss: BossResult): AnalysisResult {
  return {
    input: {
      characterName: 'Jumbaa',
      serverSlug: 'ysondre',
      region: 'EU',
      difficulty: 5,
      encounters: [{ id: 3306, name: 'Chimaerus' }],
      specId: 103,
    },
    bosses: [boss],
    generatedAt: '2026-05-09T00:00:00.000Z',
  };
}

describe('trajectory section', () => {
  // Le message central pour la cible : le DPS monte, le percentile ne bouge plus.
  it('names the plateau and hangs the verdict on the percentile', () => {
    const boss = makeBoss({
      trajectory: trajectory([
        { pct: 61, dps: 240000, bracket: 630 },
        { pct: 59, dps: 245000, bracket: 632 },
        { pct: 62, dps: 248000, bracket: 634 },
        { pct: 60, dps: 252000, bracket: 636 },
      ]),
    });

    const prompt = buildAnalysisPrompt(resultWith(boss));

    expect(prompt).toContain('### Trajectory');
    expect(prompt).toContain('a plateau');
    expect(prompt).toContain('percentile per kill');
  });

  // Les deux coefficients sont des hypothèses : un modèle qui citerait leur sortie comme une
  // mesure fabriquerait une précision qui n'existe pas.
  it('presents the decomposition as an estimate, and marks the remainder as the player', () => {
    const boss = makeBoss({
      trajectory: trajectory([
        { pct: 60, dps: 250000, bracket: 630 },
        { pct: 61, dps: 262500, bracket: 634 },
      ]),
    });

    const prompt = buildAnalysisPrompt(resultWith(boss));

    // 4 ilvl × 1 % × 250 000 = 10 000 de matériel ; il reste 2 500 pour le joueur.
    expect(prompt).toContain('+10,000 attributable to item level');
    expect(prompt).toContain('+2,500 unexplained by context');
    expect(prompt).toContain('not measurements');
  });

  it('says the list holds kills only', () => {
    const boss = makeBoss({ trajectory: trajectory([{ pct: 60 }, { pct: 62 }]) });

    expect(buildAnalysisPrompt(resultWith(boss))).toContain('does not rank a wipe');
  });

  it('excludes another spec and says how many kills that costs', () => {
    const boss = makeBoss({
      trajectory: trajectory([
        { pct: 10, spec: 'Balance' },
        { pct: 20, spec: 'Balance' },
        { pct: 60 },
        { pct: 62 },
      ]),
    });

    expect(buildAnalysisPrompt(resultWith(boss))).toContain('2 earlier kill(s) on another spec');
  });

  // Un rapport isolé reste un rapport valide : ni section, ni axe couvert.
  it('opens no section when the source yielded a single kill', () => {
    const boss = makeBoss({ trajectory: trajectory([{ pct: 60 }]) });

    expect(buildAnalysisPrompt(resultWith(boss))).not.toContain('### Trajectory');
    expect(coveredAxes(boss)).not.toContain('trajectory');
  });

  it('counts the axis as covered once the curve exists', () => {
    const boss = makeBoss({ trajectory: trajectory([{ pct: 60 }, { pct: 62 }]) });

    expect(coveredAxes(boss)).toContain('trajectory');
  });
});

describe('coveredAxes', () => {
  it('reports the axes the prompt actually filled', () => {
    const axes = coveredAxes(makeBoss());

    expect(axes).toContain('stats');
    expect(axes).toContain('spell-usage');
    expect(axes).toContain('damage');
  });

  // Un titre rendu au-dessus d'un tableau vide n'est pas une couverture : l'empreinte doit
  // dire ce dont le rapport a pu parler, pas ce que le gabarit a imprimé.
  it('does not count an axis whose body came out empty', () => {
    const boss = makeBoss();
    boss.character.rotation = { ...boss.character.rotation, buffs: {} };
    boss.topPlayers = boss.topPlayers.map((p) => ({
      ...p,
      rotation: { ...p.rotation, buffs: {} },
    }));

    const axes = coveredAxes(boss);

    expect(axes).not.toContain('uptimes');
    expect(axes).toContain('spell-usage');
  });

  // Le fixture n'a pas d'ouverture : la section est absente du prompt, elle doit l'être de
  // l'empreinte aussi.
  it('leaves out the opening when there is none', () => {
    expect(coveredAxes(makeBoss())).not.toContain('opening');
  });

  it('never invents an axis outside the shared vocabulary', () => {
    for (const axis of coveredAxes(makeBoss())) {
      expect(PROMPT_AXES).toContain(axis);
    }
  });
});

describe('spell usage ordering', () => {
  // Le tri par écart brut mettrait Ferocious Bite (−16.7 %) devant Shred (−10.3 %). Pondéré
  // par la part de dégâts, Shred passe devant : c'est lui qui coûte du DPS, l'autre non.
  it('orders the rows by damage impact, not by raw deviation', () => {
    const prompt = buildAnalysisPrompt(resultWith(makeBoss()));
    const table = prompt.slice(prompt.indexOf('### Spell Usage'));

    const at = (name: string) => table.indexOf(`| ${name} |`);

    expect(at('Rip')).toBeGreaterThan(-1);
    expect(at('Rip')).toBeLessThan(at('Shred'));
    expect(at('Shred')).toBeLessThan(at('Ferocious Bite'));
    expect(at('Ferocious Bite')).toBeLessThan(at('Berserk'));
  });

  // Le modèle refait le tri à sa façon s'il n'est pas prévenu que celui-ci porte un sens.
  it('says the order is the impact order and forbids re-ranking', () => {
    const prompt = buildAnalysisPrompt(resultWith(makeBoss()));

    expect(prompt).toContain('ordered by damage impact');
    expect(prompt).toContain('do not re-rank the table');
  });
});

describe('talent section', () => {
  /**
   * Blizzard rend deux copies de spec à la même position de grille. Fusionnées, elles font
   * un nœud que le joueur a rempli ; comptées séparément, la seconde devient un talent
   * « pris par le champ, pas par toi » que l'écran n'a jamais montré.
   */
  const twinNodes = [
    {
      id: 900,
      talentIds: [391528],
      name: 'Convoke the Spirits',
      names: ['Convoke the Spirits'],
      spellId: 391528,
      row: 1,
      col: 0,
      maxRanks: 1,
      nodeType: 'single' as const,
      treeType: 'spec' as const,
      children: [],
    },
    {
      id: 901,
      talentIds: [395152],
      name: '',
      names: [],
      spellId: 395152,
      row: 1,
      col: 0,
      maxRanks: 1,
      nodeType: 'single' as const,
      treeType: 'spec' as const,
      children: [],
    },
  ];

  it('names no talent the player was never shown', () => {
    const prompt = buildAnalysisPrompt(resultWith(makeBoss()), twinNodes);

    expect(prompt).toContain('Talent Differences');
    expect(prompt).toContain('shared nodes');
    expect(prompt).not.toContain('Taken by the field, not by you');
    expect(prompt).not.toContain('#395152');
  });

  it('says the tree is missing rather than listing raw ids', () => {
    const prompt = buildAnalysisPrompt(resultWith(makeBoss()));

    expect(prompt).toContain('Talent tree unavailable for this spec');
  });
});

describe('damage breakdown', () => {
  // Le cas que le produit vend : Rake est 27 % des dégâts de la référence et zéro des miens.
  // Ancré sur mon seul top-N, il n'apparaissait pas — donc le rapport n'en parlait jamais.
  it('holds an ability only the field converts', () => {
    const prompt = buildAnalysisPrompt(resultWith(makeBoss()));
    const table = prompt.slice(prompt.indexOf('### Damage Breakdown'));

    expect(table).toContain('| Rake |');
    expect(table).toContain('Gap (pts)');
    // 0 % chez moi, 26.7 % chez la référence : l'écart est positif et se lit dans ce sens.
    const row = table.split('\n').find((l) => l.startsWith('| Rake |')) ?? '';
    expect(row).toContain('| 0.0 |');
    expect(row).toContain('| +26.7 |');
  });
});

describe('target split', () => {
  it('puts the subject and each reference side by side', () => {
    const boss = makeBoss();
    boss.topPlayers[0].fightTargets = [
      { name: 'Chimaerus', type: 'Boss', damagePct: 81.0 },
      { name: 'Frenzied Whelp', type: 'NPC', damagePct: 19.0 },
    ];

    const prompt = buildAnalysisPrompt(resultWith(boss));
    const table = prompt.slice(prompt.indexOf('### Damage by Target'));

    expect(table).toContain('| Target | Type | You % | P1 % |');
    expect(table).toContain('| Chimaerus | Boss | 95.0 | 81.0 |');
    // Le sujet n'a rien mis sur l'add : la case dit 0.0, pas un tiret — il a bien un relevé.
    expect(table).toContain('| Frenzied Whelp | NPC | 0.0 | 19.0 |');
    expect(table).toContain('difference in assignment, not a mistake');
  });

  it('forbids calling a divergence when no reference reported a split', () => {
    const prompt = buildAnalysisPrompt(resultWith(makeBoss()));

    expect(prompt).toContain('No reference target split available');
    expect(prompt).toContain('do not call any divergence');
  });
});

describe('scope of the prompt', () => {
  /**
   * La mort précoce est un avertissement de comparabilité, rendu à l'écran par le bandeau.
   * Elle n'entre pas dans le prompt : le modèle conseille les dégâts sortants, et une donnée
   * de survie dans ses tableaux l'amènerait à coacher la survie — hors périmètre, et sur une
   * seule pull, sans valeur.
   */
  it('lets no death data reach the model', () => {
    const boss = makeBoss();
    boss.character.context = {
      deaths: 4,
      subjectDied: true,
      subjectDeathMs: 111600,
      wipesBefore: 7,
    };

    const prompt = buildAnalysisPrompt(resultWith(boss));

    expect(prompt).not.toMatch(/\bdeaths?\b/i);
    expect(prompt).not.toMatch(/\bdied\b/i);
    expect(prompt).not.toMatch(/\bwipes?\b/i);
    expect(prompt).not.toContain('111,600');
    // La formulation la plus forte : le contexte de pull ne change pas un caractère du
    // prompt. L'`earlyDeathPct` du verdict, dérivé de ces mêmes champs, ne fuit donc pas non
    // plus par la section de comparabilité.
    expect(prompt).toBe(buildAnalysisPrompt(resultWith(makeBoss())));
  });

  it('tells the model to stay on outgoing damage', () => {
    expect(SYSTEM_PROMPT).toContain('outgoing damage only');
    expect(SYSTEM_PROMPT).toMatch(/never advise on survival/i);
  });
});
