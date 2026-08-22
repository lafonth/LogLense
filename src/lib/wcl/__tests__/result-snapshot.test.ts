import type { BossResult } from '@/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  characterSnapshotKey,
  readSnapshot,
  reportSnapshotKey,
  SNAPSHOT_TTL_SECONDS,
  writeSnapshot,
} from '../result-snapshot';

const { redisGet, redisSetEx } = vi.hoisted(() => ({
  redisGet: vi.fn(),
  redisSetEx: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({ redisGet, redisSetEx }));

const STATS = {
  name: 'Jumbaa',
  avgIlvl: 635,
  primaryStat: 13200,
  crit: 3890,
  haste: 3500,
  mastery: 5800,
  vers: 750,
  talents: {},
};

/**
 * Un résultat complet — avec référence et table de dégâts.
 *
 * Le piège serait de partir du résultat vide qui suffit aux tests de route : il ne passerait
 * pas le contrôle de complétude, et tous les tests d'écriture passeraient pour la mauvaise
 * raison, en vérifiant un refus là où on croit vérifier une écriture.
 */
const COMPLETE: BossResult = {
  renderId: 'render-stored',
  encounter: 'Chimaerus',
  encounterId: 3306,
  specId: 103,
  difficulty: 5,
  fightTargets: [],
  character: {
    stats: STATS,
    rotation: {
      name: 'Jumbaa',
      dps: 250000,
      fightDurationMs: 180000,
      casts: {},
      buffs: {},
      opening: [],
    },
    damageTable: { entries: [{ guid: 44614, name: 'Frostbolt', total: 4_200_000 }] },
    dps: 250000,
    dpsSource: 'ranking',
    bossDps: null,
    killTime: '3:00',
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
  topPlayers: [
    {
      stats: { ...STATS, name: 'Reference', avgIlvl: 636, dps: 268000, killTime: '2:58' },
      rotation: {
        name: 'Reference',
        dps: 268000,
        fightDurationMs: 178000,
        casts: {},
        buffs: {},
        opening: [],
      },
      damageTable: { entries: [{ guid: 44614, name: 'Frostbolt', total: 4_600_000 }] },
      fightTargets: [],
      provenance: {
        code: 'ref',
        fightID: 3,
        actorId: 9,
        name: 'Reference',
        ilvl: 636,
        killTimeMs: 178000,
        dps: 268000,
        distance: 0.01,
        disqualifiedBy: [],
        tierPieces: 4,
        externalUptime: 0,
        explored: true,
      },
    },
  ],
  sample: [],
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

const CHAR_ARGS = {
  region: 'EU',
  serverSlug: 'ysondre',
  characterName: 'Jumbaa',
  encounterId: 3306,
  difficulty: 5,
  specId: 103,
};

const REPORT_ARGS = { code: 'aBcD', actorId: 63, encounterId: 3306, fightId: 17, difficulty: 5 };

beforeEach(() => {
  redisGet.mockReset().mockResolvedValue(null);
  redisSetEx.mockReset().mockResolvedValue(undefined);
});

describe('snapshot keys', () => {
  // Sans version dans la clé, un changement de forme de `BossResult` servirait pendant
  // vingt-quatre heures des instantanés que l'écran courant ne sait plus lire.
  it('carries the cache version, and separates the two pipelines', () => {
    expect(characterSnapshotKey(CHAR_ARGS)).toContain('wcl:snap:v1:char:');
    expect(reportSnapshotKey(REPORT_ARGS)).toContain('wcl:snap:v1:report:');
  });

  // La variante n'est jamais lue, mais elle est écrite : sans elle dans la clé, un
  // basculement de spec écraserait l'instantané de base et le lien rendrait l'autre spec.
  it('separates a spec override and a forced fight from the base analysis', () => {
    const base = characterSnapshotKey(CHAR_ARGS);
    const otherSpec = characterSnapshotKey({ ...CHAR_ARGS, specIdOverride: 62 });
    const otherFight = characterSnapshotKey({
      ...CHAR_ARGS,
      fightOverride: { code: 'xyz', fightID: 4 },
    });

    expect(new Set([base, otherSpec, otherFight]).size).toBe(3);
  });

  // Les champs venus du client sont les seuls que nous ne formons pas : sans encodage,
  // `Foo:ysondre` sur un royaume vide désignerait la même clé que `Foo` sur `ysondre`.
  it('does not let a separator in a client-supplied field collide two subjects', () => {
    const spilled = characterSnapshotKey({
      ...CHAR_ARGS,
      serverSlug: '',
      characterName: 'ysondre:Jumbaa',
    });

    expect(spilled).not.toBe(characterSnapshotKey(CHAR_ARGS));
  });

  // Deux pulls du même boss ne rendent pas la même analyse, et `switchPull` en change sans
  // changer de rencontre.
  it('separates two pulls of the same encounter on the report path', () => {
    expect(reportSnapshotKey({ ...REPORT_ARGS, fightId: 18 })).not.toBe(
      reportSnapshotKey(REPORT_ARGS)
    );
  });
});

describe('writeSnapshot', () => {
  // Le TTL est la garantie vis-à-vis du §5d : une copie sans expiration serait la base de
  // données permanente que les CGU refusent. Il est donc vérifié, pas seulement documenté.
  it('writes with an explicit expiry, never a bare SET', async () => {
    await writeSnapshot('k', COMPLETE);

    expect(redisSetEx).toHaveBeenCalledWith('k', expect.any(String), SNAPSHOT_TTL_SECONDS);
  });

  // Un résultat sans référence est légitime — une spec obscure sur un boss peu joué — mais
  // figé pour vingt-quatre heures il transformerait un incident de collecte en verdict.
  it('refuses a result with no reference', async () => {
    await writeSnapshot('k', { ...COMPLETE, topPlayers: [] });

    expect(redisSetEx).not.toHaveBeenCalled();
  });

  it('refuses a result with an empty damage table', async () => {
    await writeSnapshot('k', {
      ...COMPLETE,
      character: { ...COMPLETE.character, damageTable: { entries: [] } },
    });

    expect(redisSetEx).not.toHaveBeenCalled();
  });

  // L'analyse est faite et va être rendue : la perdre parce que le cache a raté serait le
  // contraire de ce que le cache est censé faire.
  it('never throws when Redis refuses the write', async () => {
    redisSetEx.mockRejectedValue(new Error('redis down'));

    await expect(writeSnapshot('k', COMPLETE)).resolves.toBeUndefined();
  });
});

describe('readSnapshot', () => {
  it('returns the stored result when the entry is complete', async () => {
    redisGet.mockResolvedValue(JSON.stringify(COMPLETE));

    const read = await readSnapshot('k');

    expect(redisGet).toHaveBeenCalledWith('k');
    expect(read?.encounter).toBe('Chimaerus');
    expect(read?.topPlayers).toHaveLength(1);
    expect(read?.character.damageTable.entries[0]?.name).toBe('Frostbolt');
  });

  /**
   * Le `renderId` est la seule clé de jointure du corpus entre exposition, verdicts et
   * conseils. Rejouer celui qui a été stocké ferait converger les étiquettes de tous les
   * lecteurs du lien sur une exposition unique : le corpus lirait un rendu là où il y en a
   * eu dix. Tout le reste doit être identique — c'est le même rendu partagé.
   */
  it('mints a fresh renderId on every read, and changes nothing else', async () => {
    redisGet.mockResolvedValue(JSON.stringify(COMPLETE));

    const first = await readSnapshot('k');
    const second = await readSnapshot('k');

    expect(first?.renderId).not.toBe(COMPLETE.renderId);
    expect(second?.renderId).not.toBe(first?.renderId);
    expect({ ...first, renderId: '' }).toEqual({ ...COMPLETE, renderId: '' });
  });

  // Échoue ouvert : un instantané est une optimisation, le perdre doit coûter des requêtes,
  // jamais un rendu.
  it('fails open on a missing entry, on unreadable JSON and on a Redis outage', async () => {
    redisGet.mockResolvedValueOnce(null);
    expect(await readSnapshot('k')).toBeNull();

    redisGet.mockResolvedValueOnce('{ not json');
    expect(await readSnapshot('k')).toBeNull();

    redisGet.mockRejectedValueOnce(new Error('redis down'));
    expect(await readSnapshot('k')).toBeNull();
  });

  it('fails open on an entry whose shape is not a BossResult', async () => {
    redisGet.mockResolvedValue(JSON.stringify({ encounter: 'Chimaerus' }));

    expect(await readSnapshot('k')).toBeNull();
  });

  // Le contrôle de complétude est relu à la lecture et pas seulement à l'écriture : un
  // déploiement intermédiaire qui aurait écrit un trou sous cette version le laisserait
  // autrement servi jusqu'au bout de sa durée de vie.
  it('refuses an entry stored empty by an earlier deploy', async () => {
    redisGet.mockResolvedValue(JSON.stringify({ ...COMPLETE, topPlayers: [] }));

    expect(await readSnapshot('k')).toBeNull();
  });
});
