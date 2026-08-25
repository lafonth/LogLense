import type { PromotionSubject } from '../promote';
import type { CachedFightData, CachedVerification } from '../reference-cache';
import type { ReferenceSample } from '@/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { promoteReference, PROMOTION_WCL_CALLS } from '../promote';

const { readCachedVerifications, readCachedFightData, writeCachedFightData, fetchFightData } =
  vi.hoisted(() => ({
    readCachedVerifications: vi.fn(),
    readCachedFightData: vi.fn(),
    writeCachedFightData: vi.fn(),
    fetchFightData: vi.fn(),
  }));

vi.mock('../reference-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../reference-cache')>()),
  readCachedVerifications,
  readCachedFightData,
  writeCachedFightData,
}));
vi.mock('../fight-data', () => ({ fetchFightData }));

function stats(name: string, avgIlvl = 640) {
  return {
    name,
    avgIlvl,
    primaryStat: 13000,
    crit: 4000,
    haste: 3500,
    mastery: 5800,
    vers: 800,
    talents: {},
  };
}

function sample(over: Partial<ReferenceSample> = {}): ReferenceSample {
  return {
    name: 'Poolboy',
    code: 'abc',
    fightID: 7,
    actorId: 42,
    stats: stats('Poolboy', 644),
    dps: 310000,
    killTimeMs: 190000,
    qualified: true,
    tierPieces: 4,
    externalUptime: 0,
    explored: false,
    ...over,
  };
}

function verification(over: Partial<CachedVerification['profile']> = {}): CachedVerification {
  return {
    combatant: { sourceID: 42, specID: 103, gear: [], auras: [] } as never,
    profile: { tierPieces: 4, externalUptime: 0, externals: [], ...over },
    aurasRead: 12,
  };
}

const fightData: CachedFightData = {
  stats: stats('Poolboy', 644),
  rotation: {
    name: 'Poolboy',
    dps: 310000,
    fightDurationMs: 190000,
    casts: { Shred: { guid: 5221, casts: 70, perMin: 22 } },
    buffs: {},
    opening: [],
  },
  damageEntries: [{ name: 'Rip', total: 4000000, hits: 20, uptime: null }] as never,
  fightTargets: [],
};

const subject: PromotionSubject = {
  ilvl: 640,
  killTimeMs: 200000,
  eligibility: { tierPieces: 4, externalUptime: 0, externals: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
  readCachedVerifications.mockResolvedValue([verification()]);
  readCachedFightData.mockResolvedValue(null);
  writeCachedFightData.mockResolvedValue(undefined);
  fetchFightData.mockResolvedValue({ ...fightData, dps: 999, eligibility: null, context: null });
});

describe('promoteReference', () => {
  it('refuses an expired verification rather than re-fetching one', async () => {
    // Sans vérification en cache, on ne sait plus dire ce qui disqualifie ce candidat. La
    // reconstituer coûterait des requêtes pour un verdict à moitié fondé : le bon geste est de
    // relancer l'analyse.
    readCachedVerifications.mockResolvedValue([null]);

    const outcome = await promoteReference('token', sample(), subject);

    expect(outcome).toEqual({ ok: false, reason: 'expired' });
    expect(fetchFightData).not.toHaveBeenCalled();
    expect(readCachedFightData).not.toHaveBeenCalled();
  });

  it('spends three requests when the fight data has to be fetched, and caches it', async () => {
    const outcome = await promoteReference('token', sample(), subject);

    expect(outcome).toMatchObject({ ok: true, wclCalls: PROMOTION_WCL_CALLS });
    expect(fetchFightData).toHaveBeenCalledTimes(1);
    expect(fetchFightData).toHaveBeenCalledWith(
      'token',
      expect.objectContaining({ code: 'abc', fightId: 7, name: 'Poolboy', fightMs: 190000 })
    );
    // Aucun contexte de raid demandé : une référence n'a pas de bandeau, et la requête de plus
    // se paierait sur chaque promotion.
    expect(fetchFightData.mock.calls[0][1]).not.toHaveProperty('context');
    expect(writeCachedFightData).toHaveBeenCalledTimes(1);
  });

  it('spends nothing when another analysis already pulled that fight', async () => {
    readCachedFightData.mockResolvedValue(fightData);

    const outcome = await promoteReference('token', sample(), subject);

    expect(outcome).toMatchObject({ ok: true, wclCalls: 0 });
    expect(fetchFightData).not.toHaveBeenCalled();
    expect(writeCachedFightData).not.toHaveBeenCalled();
  });

  it('reports a failed fetch as failed instead of half a reference', async () => {
    fetchFightData.mockRejectedValue(new Error('gateway'));

    const outcome = await promoteReference('token', sample(), subject);

    expect(outcome).toEqual({ ok: false, reason: 'failed' });
    expect(writeCachedFightData).not.toHaveBeenCalled();
  });

  it('builds the reference on the sample dps and kill time, not on the fetched ones', async () => {
    // `fetchFightData` rend son propre dps ; celui du vivier vient du classement WCL et c'est
    // lui qui a servi à sélectionner. Les deux doivent rester la même valeur d'un écran à l'autre.
    const outcome = await promoteReference('token', sample(), subject);

    expect(outcome).toMatchObject({
      ok: true,
      player: {
        stats: { dps: 310000, killTime: '3:10' },
        rotation: { casts: { Shred: { guid: 5221, casts: 70, perMin: 22 } } },
        damageTable: { entries: fightData.damageEntries },
      },
    });
  });

  it('recomputes the distance from the subject instead of carrying over the panel one', async () => {
    const outcome = await promoteReference('token', sample(), subject);

    // ilvl 644 contre 640 fait un écart d'exactement `ILVL_TOLERANCE`, kill time 190 s contre
    // 200 s fait 0,05 / 0,2 = 0,25 : la distance est la norme des deux.
    if (!outcome.ok) throw new Error('expected a promotion');
    expect(outcome.player.provenance).toMatchObject({
      code: 'abc',
      fightID: 7,
      actorId: 42,
      name: 'Poolboy',
      ilvl: 644,
      killTimeMs: 190000,
      dps: 310000,
      tierPieces: 4,
      externalUptime: 0,
      explored: false,
    });
    expect(outcome.player.provenance.distance).toBeCloseTo(Math.hypot(1, 0.25), 5);
  });

  it('names what disqualifies the candidate rather than echoing the qualified flag', async () => {
    // `qualified: true` était vrai contre le sujet de l'analyse d'origine. La promotion rejuge
    // le profil : ici le candidat porte un 4p que le sujet n'a pas, et le panel doit le nommer.
    readCachedVerifications.mockResolvedValue([
      verification({ tierPieces: 4, externalUptime: 25 }),
    ]);

    const outcome = await promoteReference('token', sample({ qualified: true }), {
      ...subject,
      eligibility: { tierPieces: 2, externalUptime: 0, externals: [] },
    });

    if (!outcome.ok) throw new Error('expected a promotion');
    expect(outcome.player.provenance.disqualifiedBy).toEqual(['set-bonus', 'external']);
    expect(outcome.player.provenance.tierPieces).toBe(4);
    expect(outcome.player.provenance.externalUptime).toBe(25);
  });
});
