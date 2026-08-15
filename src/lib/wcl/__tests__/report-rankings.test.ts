import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gql } from '../client';
import { Q_REPORT_RANKINGS_BOSSDPS, Q_REPORT_RANKINGS_DPS } from '../queries';
import { fetchReportRankings } from '../report-rankings';

vi.mock('../client', () => ({ gql: vi.fn() }));

const gqlMock = vi.mocked(gql);

function rankChar(over: Record<string, unknown> = {}) {
  return { name: 'Jumbaa', amount: 250000, rankPercent: 91.2, bracketData: 84.4, ...over };
}

function entry(fightID: number, chars: unknown[], role: 'dps' | 'healers' | 'tanks' = 'dps') {
  return { fightID, roles: { [role]: { characters: chars } } };
}

/** Une réponse de `report.rankings`, servie aux deux requêtes indifféremment. */
function answer(entries: unknown[]) {
  return { reportData: { report: { rankings: { data: entries } } } } as never;
}

describe('fetchReportRankings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gqlMock.mockResolvedValue(answer([]));
  });

  // Le gain du dédoublonnage : le nombre de requêtes ne suit plus le nombre de combats.
  it('spends two requests whatever the number of fights', async () => {
    const rankings = fetchReportRankings('token', 'abc', [1, 2, 15, 18]);

    await rankings.dps(1, 'Jumbaa');
    await rankings.bossDps(18, 'Jumbaa');

    expect(gqlMock).toHaveBeenCalledTimes(2);
    expect(gqlMock.mock.calls.map((c) => c[1])).toEqual([
      Q_REPORT_RANKINGS_DPS,
      Q_REPORT_RANKINGS_BOSSDPS,
    ]);
    expect(gqlMock.mock.calls[0]?.[2]).toEqual({ code: 'abc', fightIDs: [1, 2, 15, 18] });
  });

  // WCL regroupe par partition : demander 1, 2, 15, 18 rend 15, 18, 1, 2. Lire par index
  // attribuerait le parse d'un boss à un autre, sans que rien ne le signale.
  it('reads the entry by fightID, not by its rank in the response', async () => {
    gqlMock.mockResolvedValue(
      answer([
        entry(15, [rankChar({ amount: 150000 })]),
        entry(18, [rankChar({ amount: 180000 })]),
        entry(1, [rankChar({ amount: 100000 })]),
      ])
    );

    const rankings = fetchReportRankings('token', 'abc', [1, 15, 18]);

    expect((await rankings.dps(1, 'Jumbaa'))?.amount).toBe(100000);
    expect((await rankings.dps(18, 'Jumbaa'))?.amount).toBe(180000);
  });

  // Un combat sans classement — trash, wipe non classé — est simplement absent de `data`.
  // L'appelant doit y lire `null` et retomber sur la table de dégâts, pas hériter d'un voisin.
  it('yields null for a fight the response does not carry', async () => {
    gqlMock.mockResolvedValue(answer([entry(15, [rankChar()])]));

    const rankings = fetchReportRankings('token', 'abc', [6, 15]);

    expect(await rankings.dps(6, 'Jumbaa')).toBeNull();
  });

  it('finds the player whichever role WCL filed them under', async () => {
    gqlMock.mockResolvedValue(answer([entry(15, [rankChar()], 'tanks')]));

    const rankings = fetchReportRankings('token', 'abc', [15]);

    expect((await rankings.dps(15, 'Jumbaa'))?.rankPercent).toBe(91.2);
    expect(await rankings.dps(15, 'Quelqun')).toBeNull();
  });

  // Toutes les rencontres peuvent abandonner avant de lire les classements — acteur
  // introuvable, spec inconnue. Sans puits sur les promesses partagées, Node terminerait le
  // processus sur la rejection que plus personne n'attend.
  it('does not leave a rejection unread when nobody queries it', async () => {
    gqlMock.mockRejectedValue(new Error('WCL down'));

    fetchReportRankings('token', 'abc', [15]);

    await new Promise((resolve) => setImmediate(resolve));
  });

  it('propagates the failure to whoever does read it', async () => {
    gqlMock.mockRejectedValue(new Error('WCL down'));

    const rankings = fetchReportRankings('token', 'abc', [15]);

    await expect(rankings.dps(15, 'Jumbaa')).rejects.toThrow('WCL down');
  });
});
