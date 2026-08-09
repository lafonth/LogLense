import type { PullPointer } from '../pull-pipeline';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findCombatantByActorId } from '../combatant';
import { fetchFightData } from '../fight-data';
import { fetchPullComparison, fetchPullSnapshot } from '../pull-pipeline';

const fixtures = vi.hoisted(() => ({
  combatant: { sourceID: 63, specID: 103, gear: [] },
  fightData: {
    stats: { name: 'Jumbaa', avgIlvl: 635, talents: {} },
    rotation: { name: 'Jumbaa', dps: 250000, fightDurationMs: 180000, casts: {}, buffs: {} },
    damageEntries: [],
    dps: 250000,
    eligibility: { tierPieces: 4, externalUptime: 0, externals: [] },
    context: { deaths: 0, subjectDied: false, subjectDeathMs: null, wipesBefore: 0 },
  },
}));

vi.mock('../combatant', () => ({ findCombatantByActorId: vi.fn() }));
vi.mock('../fight-data', () => ({ fetchFightData: vi.fn() }));

const combatantMock = vi.mocked(findCombatantByActorId);
const fightDataMock = vi.mocked(fetchFightData);

function pointer(over: Partial<PullPointer> = {}): PullPointer {
  return {
    code: 'abc',
    fightId: 17,
    actorId: 63,
    name: 'Jumbaa',
    fightMs: 180000,
    encounterId: 3306,
    difficulty: 5,
    ...over,
  };
}

describe('fetchPullSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    combatantMock.mockResolvedValue(fixtures.combatant as never);
    fightDataMock.mockResolvedValue(fixtures.fightData as never);
  });

  it('gives up when the actor has no combatant event in the fight', async () => {
    combatantMock.mockResolvedValue(null);

    expect(await fetchPullSnapshot('token', pointer())).toBeNull();
    expect(fightDataMock).not.toHaveBeenCalled();
  });

  it('fetches raid context for the pull, since both pulls act as subjects here', async () => {
    await fetchPullSnapshot('token', pointer());

    expect(fightDataMock).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ context: { encounterId: 3306, difficulty: 5 } })
    );
  });

  it('carries the pointer identity alongside the fetched data', async () => {
    const snapshot = await fetchPullSnapshot('token', pointer());

    expect(snapshot).toMatchObject({
      code: 'abc',
      fightId: 17,
      actorId: 63,
      name: 'Jumbaa',
      fightMs: 180000,
      dps: 250000,
    });
  });
});

describe('fetchPullComparison', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    combatantMock.mockResolvedValue(fixtures.combatant as never);
    fightDataMock.mockResolvedValue(fixtures.fightData as never);
  });

  it('gives up when either pull cannot be resolved', async () => {
    combatantMock.mockResolvedValueOnce(fixtures.combatant as never).mockResolvedValueOnce(null);

    const result = await fetchPullComparison('token', pointer(), pointer({ fightId: 18 }), 103);

    expect(result).toBeNull();
  });

  it('fetches both pulls in parallel and compares them', async () => {
    const result = await fetchPullComparison('token', pointer(), pointer({ fightId: 18 }), 103);

    expect(combatantMock).toHaveBeenCalledTimes(2);
    expect(result?.comparison.delta.dpsDelta).toBe(0);
    expect(result?.before.fightId).toBe(17);
    expect(result?.after.fightId).toBe(18);
  });
});
