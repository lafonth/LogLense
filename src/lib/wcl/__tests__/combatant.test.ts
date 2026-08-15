import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchReportCombatants, findCombatantByActorId, findCombatantByName } from '../combatant';

const EVENTS = [
  { sourceID: 1, specID: 103, agility: 13200 },
  { sourceID: 2, specID: 250, strength: 14000 },
  { sourceID: 3, specID: 103, agility: 12000 },
];

const ACTORS = [
  { id: 1, name: 'Jumbaa', type: 'Player' },
  { id: 2, name: 'Tankou', type: 'Player' },
  { id: 9, name: 'Jumbaa', type: 'NPC' },
];

function mockReport(payload: unknown) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: payload }),
  } as Response);
}

describe('combatant lookups', () => {
  beforeEach(() => vi.restoreAllMocks());

  describe('findCombatantByActorId', () => {
    it('returns the combatant whose sourceID matches', async () => {
      mockReport({ reportData: { report: { events: { data: EVENTS } } } });

      const found = await findCombatantByActorId('token', 'abc', 7, 2);
      expect(found).toEqual({ sourceID: 2, specID: 250, strength: 14000 });
    });

    it('returns null when no combatant matches', async () => {
      mockReport({ reportData: { report: { events: { data: EVENTS } } } });

      expect(await findCombatantByActorId('token', 'abc', 7, 99)).toBeNull();
    });
  });

  describe('fetchReportCombatants', () => {
    /** Le même joueur, une ligne par pull : la forme que rend un lot de `fightIDs`. */
    const BATCH = [
      { fight: 7, sourceID: 2, specID: 250, gear: [{ id: 200, itemLevel: 636, quality: 4 }] },
      { fight: 7, sourceID: 1, specID: 103, agility: 13200 },
      { fight: 12, sourceID: 2, specID: 250, gear: [{ id: 200, itemLevel: 645, quality: 4 }] },
    ];

    // Le gain du dédoublonnage : le nombre de requêtes ne suit plus le nombre de combats.
    it('spends one request whatever the number of fights', async () => {
      mockReport({ reportData: { report: { events: { data: BATCH } } } });

      const combatants = fetchReportCombatants('token', 'abc', [7, 12]);

      expect((await combatants.byActor(7, 1))?.specID).toBe(103);
      expect((await combatants.byActor(12, 2))?.specID).toBe(250);
      expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1);
    });

    // Le risque propre au lot : un `sourceID` désigne un acteur du rapport, pas d'un combat.
    // Sans le filtre sur `fight`, la première pull du joueur serait rendue pour toutes — donc
    // son éligibilité jugée sur l'équipement d'une autre.
    it('returns the gear of the requested fight, not of the first one carrying the actor', async () => {
      mockReport({ reportData: { report: { events: { data: BATCH } } } });

      const combatants = fetchReportCombatants('token', 'abc', [7, 12]);

      expect((await combatants.byActor(12, 2))?.gear?.[0]?.itemLevel).toBe(645);
      expect((await combatants.byActor(7, 2))?.gear?.[0]?.itemLevel).toBe(636);
    });

    it('yields null for a fight the actor was absent from', async () => {
      mockReport({ reportData: { report: { events: { data: BATCH } } } });

      const combatants = fetchReportCombatants('token', 'abc', [7, 12]);

      expect(await combatants.byActor(12, 1)).toBeNull();
    });

    // Toutes les rencontres peuvent abandonner avant de lire le lot. Sans puits sur la
    // promesse partagée, Node terminerait le processus sur la rejection que plus personne
    // n'attend.
    it('does not leave a rejection unread when nobody queries it', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('WCL down'));

      fetchReportCombatants('token', 'abc', [7]);

      await new Promise((resolve) => setImmediate(resolve));
    });

    it('propagates the failure to whoever does read it', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('WCL down'));

      const combatants = fetchReportCombatants('token', 'abc', [7]);

      await expect(combatants.byActor(7, 1)).rejects.toThrow('WCL down');
    });
  });

  describe('findCombatantByName', () => {
    it('resolves the actor by name, then returns their combatant', async () => {
      mockReport({
        reportData: {
          report: { events: { data: EVENTS }, masterData: { actors: ACTORS } },
        },
      });

      const found = await findCombatantByName('token', 'abc', 7, 'Jumbaa');
      expect(found).toEqual({ sourceID: 1, specID: 103, agility: 13200 });
    });

    // The reason reference lookup matches on name rather than on spec: a raid can
    // field two players of the same spec, and picking by spec returned whichever came
    // first — another player's gear, talents and rotation under this one's name.
    it('picks the named player, not the first one of their spec', async () => {
      mockReport({
        reportData: {
          report: {
            events: { data: EVENTS },
            masterData: { actors: [...ACTORS, { id: 3, name: 'Secondferal', type: 'Player' }] },
          },
        },
      });

      const found = await findCombatantByName('token', 'abc', 7, 'Secondferal');
      expect(found).toEqual({ sourceID: 3, specID: 103, agility: 12000 });
    });

    it('ignores non-player actors sharing the name', async () => {
      mockReport({
        reportData: {
          report: {
            events: { data: [{ sourceID: 9, specID: 103 }] },
            masterData: { actors: ACTORS },
          },
        },
      });

      // Jumbaa the NPC is actor 9, but only the Player entry may be resolved
      expect(await findCombatantByName('token', 'abc', 7, 'Jumbaa')).toBeNull();
    });

    it('returns null when the actor is absent from masterData', async () => {
      mockReport({
        reportData: {
          report: { events: { data: EVENTS }, masterData: { actors: ACTORS } },
        },
      });

      expect(await findCombatantByName('token', 'abc', 7, 'Inconnu')).toBeNull();
    });

    it('returns null when the actor exists but has no combatant event', async () => {
      mockReport({
        reportData: {
          report: { events: { data: [EVENTS[0]] }, masterData: { actors: ACTORS } },
        },
      });

      expect(await findCombatantByName('token', 'abc', 7, 'Tankou')).toBeNull();
    });
  });
});
