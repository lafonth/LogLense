import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findCombatantByActorId, findCombatantByName, findCombatantBySpecId } from '../combatant';

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

  describe('findCombatantBySpecId', () => {
    it('returns the first combatant of that spec', async () => {
      mockReport({ reportData: { report: { events: { data: EVENTS } } } });

      const found = await findCombatantBySpecId('token', 'abc', 7, 103);
      expect(found).toEqual({ sourceID: 1, specID: 103, agility: 13200 });
    });

    it('returns null when the spec is absent', async () => {
      mockReport({ reportData: { report: { events: { data: EVENTS } } } });

      expect(await findCombatantBySpecId('token', 'abc', 7, 577)).toBeNull();
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
