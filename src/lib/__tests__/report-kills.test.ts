import type { ReportFight } from '@/types';
import { describe, expect, it } from 'vitest';
import { groupKillsByEncounter, lastKillOf } from '@/lib/report-kills';

function fight(over: Partial<ReportFight> = {}): ReportFight {
  return {
    id: 1,
    name: 'Chimaerus',
    encounterID: 3306,
    kill: true,
    startTime: 0,
    endTime: 180000,
    difficulty: 5,
    ...over,
  };
}

describe('groupKillsByEncounter', () => {
  it('keeps only the kills of the requested difficulty', () => {
    const groups = groupKillsByEncounter([fight({ id: 1 }), fight({ id: 2, difficulty: 4 })], 5);

    expect(groups).toEqual([
      { id: 3306, name: 'Chimaerus', kills: [{ fightId: 1, fightMs: 180000 }] },
    ]);
  });

  it('drops the wipes, which carry no ranking', () => {
    const groups = groupKillsByEncounter([fight({ id: 1, kill: false }), fight({ id: 2 })], 5);

    expect(groups[0].kills).toEqual([{ fightId: 2, fightMs: 180000 }]);
  });

  it('drops the trash pulls, which carry no encounter', () => {
    const groups = groupKillsByEncounter([fight({ id: 1, encounterID: 0, name: 'Trash' })], 5);

    expect(groups).toEqual([]);
  });

  it('gathers every kill of one encounter in the order of the report', () => {
    const groups = groupKillsByEncounter(
      [
        fight({ id: 1, startTime: 0, endTime: 200000 }),
        fight({ id: 7, startTime: 500000, endTime: 660000 }),
      ],
      5
    );

    expect(groups[0].kills).toEqual([
      { fightId: 1, fightMs: 200000 },
      { fightId: 7, fightMs: 160000 },
    ]);
  });

  it('keeps the encounters in the order they were first killed', () => {
    // L'ordre est le contrat entre la liste de boss affichée et le tableau `bosses` rendu
    // par le serveur : une divergence recollerait un résultat sur le mauvais boss.
    const groups = groupKillsByEncounter(
      [
        fight({ id: 1, encounterID: 3307, name: 'Fractillus' }),
        fight({ id: 2 }),
        fight({ id: 3, encounterID: 3307, name: 'Fractillus' }),
      ],
      5
    );

    expect(groups.map((g) => g.name)).toEqual(['Fractillus', 'Chimaerus']);
  });
});

describe('lastKillOf', () => {
  it('names the most recent kill, the one analysed by default', () => {
    const [group] = groupKillsByEncounter(
      [fight({ id: 1 }), fight({ id: 2, startTime: 500000, endTime: 660000 })],
      5
    );

    expect(lastKillOf(group)).toEqual({ fightId: 2, fightMs: 160000 });
  });
});
