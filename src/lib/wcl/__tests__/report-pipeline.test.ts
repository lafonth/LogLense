import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gql } from '../client';
import { findCombatantByActorId } from '../combatant';
import { fetchFightData } from '../fight-data';
import { fetchCharacterHistory } from '../historical-parse';
import { analyzeReportBoss } from '../report-pipeline';

const fixtures = vi.hoisted(() => ({
  combatant: { sourceID: 63, specID: 103, gear: [] },
  fightData: {
    stats: { name: 'Jumbaa', avgIlvl: 635, talents: {} },
    rotation: { name: 'Jumbaa', dps: 250000, fightDurationMs: 180000, casts: {}, buffs: {} },
    damageEntries: [],
    fightTargets: [],
    dps: 250000,
    eligibility: { tierPieces: 4, externalUptime: 0, externals: [] },
    context: { deaths: [] },
  },
  references: {
    topPlayers: [],
    sample: [],
    comparability: { level: 'close' },
  },
}));

vi.mock('../client', () => ({ gql: vi.fn() }));
vi.mock('../combatant', () => ({ findCombatantByActorId: vi.fn() }));
vi.mock('../fight-data', () => ({
  fetchFightData: vi.fn().mockResolvedValue(fixtures.fightData),
}));
vi.mock('../historical-parse', () => ({ fetchCharacterHistory: vi.fn() }));
vi.mock('../references', () => ({
  fetchCandidatePool: vi.fn().mockResolvedValue({ candidates: [], pagesFetched: 0 }),
  resolveReferences: vi.fn().mockResolvedValue(fixtures.references),
}));

const gqlMock = vi.mocked(gql);
const combatantMock = vi.mocked(findCombatantByActorId);
const historyMock = vi.mocked(fetchCharacterHistory);

/** Une entrée de classement, avec de quoi retrouver le personnage sur son royaume. */
function rankChar(over: Record<string, unknown> = {}) {
  return {
    name: 'Jumbaa',
    amount: 250000.4,
    rankPercent: 91.26,
    bracketData: 84.44,
    totalParses: 1200,
    server: { name: 'Ysondre', region: 'EU' },
    ...over,
  };
}

/**
 * `role` place le joueur ailleurs que chez les dps : c'est le seul axe qui varie ici.
 *
 * `fightID` porte le combat de `run()` : les entrées sont retrouvées par lui, jamais par leur
 * rang dans `data`. Une entrée sans discriminant ne décrit aucun combat, et n'est donc lue
 * pour aucun.
 */
function rankings(role: 'dps' | 'healers' | 'tanks', chars: unknown[]) {
  return { data: [{ fightID: 17, roles: { [role]: { characters: chars } } }] };
}

function stubGql(dps: unknown, boss: unknown = rankings('dps', [])) {
  gqlMock
    .mockResolvedValueOnce({ reportData: { report: { rankings: dps } } } as never)
    .mockResolvedValueOnce({ reportData: { report: { rankings: boss } } } as never);
}

function run() {
  return analyzeReportBoss('token', 'abc', 3306, 'Chimaerus', 63, 'Jumbaa', 17, 180000, 5);
}

describe('analyzeReportBoss', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    combatantMock.mockResolvedValue(fixtures.combatant as never);
    historyMock.mockResolvedValue({ parse: null, trajectory: [] } as never);
  });

  it('gives up when the actor has no combatant event in the fight', async () => {
    combatantMock.mockResolvedValue(null as never);
    stubGql(rankings('dps', [rankChar()]));

    expect(await run()).toBeNull();
  });

  it('gives up when the combatant reports a spec the table does not know', async () => {
    combatantMock.mockResolvedValue({ ...fixtures.combatant, specID: 99999 } as never);
    stubGql(rankings('dps', [rankChar()]));

    expect(await run()).toBeNull();
  });

  // Un heal ou un tank apparaît dans son propre rôle : ne lire que `dps` le laissait sans
  // aucun percentile alors que WCL en avait un.
  it('finds the player whichever role WCL filed them under', async () => {
    stubGql(rankings('healers', [rankChar()]));

    const result = await run();

    expect(result?.character.todayPct).toBe(91.3);
    expect(result?.character.bracket).toBe(84.4);
  });

  it('leaves the percentiles null when the player is absent from the rankings', async () => {
    stubGql(rankings('dps', [rankChar({ name: 'Quelqun' })]));

    const result = await run();

    expect(result?.character.todayPct).toBeNull();
    expect(result?.character.overallPct).toBeNull();
    expect(result?.character.bracket).toBeNull();
    expect(result?.character.bossDps).toBeNull();
  });

  // Le percentile verrouillé est celui que le joueur cite ; celui du jour bouge sous ses
  // pieds. Quand l'historique répond, c'est lui qui doit s'afficher — et les deux valeurs
  // doivent rester distinguables.
  it('prefers the locked percentile over today’s when the history answers', async () => {
    stubGql(rankings('dps', [rankChar()]));
    historyMock.mockResolvedValue({
      parse: { rankPercent: 97.84, rankTotalParses: 5000 },
      trajectory: [{ pct: 97.8 }],
    } as never);

    const result = await run();

    expect(result?.character.overallPct).toBe(97.8);
    expect(result?.character.overallPctOf).toBe(5000);
    expect(result?.character.todayPct).toBe(91.3);
    expect(result?.character.trajectory).toHaveLength(1);
  });

  it('falls back on today’s percentile when the history fails', async () => {
    stubGql(rankings('dps', [rankChar()]));

    const result = await run();

    expect(result?.character.overallPct).toBe(91.3);
    expect(result?.character.overallPctOf).toBe(1200);
    expect(result?.character.trajectory).toEqual([]);
  });

  // Sans royaume, `fetchCharacterHistory` n'a rien à interroger : l'appeler quand même
  // dépenserait un aller-retour WCL pour une requête vouée à échouer.
  it('does not ask for a history it cannot address', async () => {
    stubGql(rankings('dps', [rankChar({ server: undefined })]));

    const result = await run();

    expect(historyMock).not.toHaveBeenCalled();
    expect(result?.character.overallPct).toBe(91.3);
  });

  // L'invariant du produit : l'écart affiché est une soustraction entre le DPS du sujet et
  // celui des références, et `references.ts` prend toujours le montant des classements WCL.
  // Ce chemin dérivait le sien de la table de dégâts — deux mesures, une soustraction.
  it('measures the subject’s dps with the same ruler as the references', async () => {
    stubGql(rankings('dps', [rankChar()]));

    const result = await run();

    expect(vi.mocked(fetchFightData).mock.calls[0]?.[1]).toMatchObject({ dps: 250000 });
    expect(result?.character.dpsSource).toBe('ranking');
  });

  // Le repli reste la dérivation depuis la table de dégâts : moins comparable, mais un DPS.
  // Il doit se déclarer, sans quoi le corpus mélange les deux mesures sans le dire.
  it('declares the fallback when the rankings hold nothing on the player', async () => {
    stubGql(rankings('dps', [rankChar({ name: 'Quelqun' })]));

    const result = await run();

    expect(vi.mocked(fetchFightData).mock.calls[0]?.[1]).toMatchObject({ dps: undefined });
    expect(result?.character.dpsSource).toBe('damage-table');
  });

  it('rounds the boss damage and carries the source of the fight', async () => {
    stubGql(rankings('dps', [rankChar()]), rankings('dps', [rankChar({ amount: 180000.6 })]));

    const result = await run();

    expect(result?.character.bossDps).toBe(180001);
    expect(result?.character.source).toEqual({ code: 'abc', fightID: 17, actorId: 63 });
    expect(result?.specId).toBe(103);
    expect(result?.character.killTime).toBe('3:00');
  });
});
