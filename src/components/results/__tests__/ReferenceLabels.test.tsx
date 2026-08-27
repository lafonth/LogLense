import type { BossResult, ReferenceProvenance, TopPlayer } from '@/types';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSubmission } from '@/lib/labels/schema';
import { ReferenceLabels } from '../ReferenceLabels';

// Le code de rapport ne dérive pas du nom : le corps envoyé est vérifié par recherche de
// sous-chaîne, et un `code-Baldan` ferait passer ce contrôle pour une raison qui n'en est pas une.
function provenance(name: string, rank: number): ReferenceProvenance {
  return {
    code: `log-${rank}`,
    fightID: rank,
    actorId: 40 + rank,
    name,
    ilvl: 285,
    killTimeMs: 317924,
    dps: 123456,
    distance: 0.42,
    disqualifiedBy: [],
    tierPieces: 4,
    externalUptime: 0,
    explored: false,
  };
}

function topPlayer(name: string, rank: number): TopPlayer {
  return {
    stats: {
      name,
      avgIlvl: 285,
      primaryStat: 0,
      crit: 0,
      haste: 0,
      mastery: 0,
      vers: 0,
      talents: {},
      dps: 123456,
      killTime: '5:17',
    },
    rotation: { name, dps: 123456, fightDurationMs: 317924, casts: {}, buffs: {}, opening: [] },
    damageTable: { entries: [] },
    fightTargets: [],
    provenance: provenance(name, rank),
  };
}

function result(): BossResult {
  return {
    renderId: 'render-1',
    encounter: 'Vorasius',
    encounterId: 3177,
    difficulty: 5,
    specId: 103,
    fightTargets: [],
    character: {
      stats: {
        name: 'Jumbaa',
        avgIlvl: 284.1,
        primaryStat: 0,
        crit: 0,
        haste: 0,
        mastery: 0,
        vers: 0,
        talents: {},
      },
      rotation: {
        name: 'Jumbaa',
        dps: 105538,
        fightDurationMs: 326876,
        casts: {},
        buffs: {},
        opening: [],
      },
      damageTable: { entries: [] },
      dps: 105538,
      dpsSource: 'ranking',
      bossDps: null,
      killTime: '5:26',
      overallPct: null,
      overallPctOf: null,
      todayPct: null,
      bossDpsPct: null,
      bracket: null,
      source: { code: 'abc', fightID: 17, actorId: 63 },
      trajectory: [],
      eligibility: { tierPieces: 4, externalUptime: 0, externals: [] },
      context: null,
    },
    topPlayers: [topPlayer('Aidan', 1), topPlayer('Baldan', 2)],
    sample: [],
    comparability: {
      level: 'close',
      referenceIlvl: 285,
      referenceIlvlCount: 3,
      myIlvl: 284.1,
      referenceKillTimeMs: 317924,
      myKillTimeMs: 326876,
      candidatesConsidered: 981,
      pagesFetched: 10,
      disqualified: 0,
      unverifiable: 0,
      substituted: 0,
      poolDps: null,
      poolIlvl: null,
      poolIlvlCount: 0,
    },
  };
}

describe('referenceLabels', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, length: 1 }),
    } as Response);
  });

  it('lists every reference by name', () => {
    render(<ReferenceLabels result={result()} />);

    expect(screen.getByText('Aidan')).toBeInTheDocument();
    expect(screen.getByText('Baldan')).toBeInTheDocument();
  });

  it('says which references were kept without qualifying, and why', () => {
    const r = result();
    r.topPlayers[1].provenance.disqualifiedBy = ['set-bonus', 'external'];

    render(<ReferenceLabels result={r} />);

    // Une seule : la première a qualifié, et le marquage ne doit pas déborder sur elle.
    const marks = screen.getAllByText(/Kept without qualifying/);
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent('better set bonus, externals you did not have');
  });

  it('shows the reasons only after the reference is challenged', async () => {
    const user = userEvent.setup();
    render(<ReferenceLabels result={result()} />);

    expect(screen.queryByRole('button', { name: 'Externals' })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Not comparable' })[0]);

    expect(screen.getByRole('button', { name: 'Externals' })).toBeInTheDocument();
  });

  it('posts the chosen reason with the right reference and signed gaps', async () => {
    const user = userEvent.setup();
    render(<ReferenceLabels result={result()} />);

    await user.click(screen.getAllByRole('button', { name: 'Not comparable' })[1]);
    await user.click(screen.getByRole('button', { name: 'Kill time' }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/labels/comparability');
    const sent = JSON.parse(String((init as RequestInit).body));

    expect(sent.reason).toBe('kill-time');
    expect(sent.scores.rank).toBe(2);
    // Le rendu que le serveur a estampillé, repris tel quel : c'est la jointure.
    expect(sent.renderId).toBe('render-1');
    // Pointeurs seuls des deux côtés — ni mesure recopiée, ni vivier.
    expect(sent.subject).toEqual({ code: 'abc', fightID: 17, actorId: 63 });
    expect(sent.reference).toEqual({
      code: 'log-2',
      fightID: 2,
      actorId: 42,
      disqualifiedBy: [],
    });
    expect(sent.pool).toBeUndefined();
    // Signed, reference − subject: these references are better geared and faster.
    expect(sent.scores.ilvlGap).toBeCloseTo(0.9, 5);
    expect(sent.scores.killTimeGapPct).toBeLessThan(0);
  });

  // §5c des CGU : le nom s'affiche à l'écran pour que le lecteur sache qui il conteste, et
  // ne quitte jamais le navigateur. `actorId` porte la même information dans le corpus.
  it('sends no character name, though it shows them', async () => {
    const user = userEvent.setup();
    render(<ReferenceLabels result={result()} />);

    expect(screen.getByText('Baldan')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Not comparable' })[1]);
    await user.click(screen.getByRole('button', { name: 'Externals' }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = String((init as RequestInit).body);

    expect(body).not.toContain('Baldan');
    expect(body).not.toContain('Jumbaa');
  });

  it('marks the reference as recorded once the write succeeds', async () => {
    const user = userEvent.setup();
    render(<ReferenceLabels result={result()} />);

    await user.click(screen.getAllByRole('button', { name: 'Not comparable' })[0]);
    await user.click(screen.getByRole('button', { name: 'Externals' }));

    expect(await screen.findByText('Recorded')).toBeInTheDocument();
  });

  // A lost click is a lost datum — never let a failed write look like a success.
  it('surfaces a failed write and allows a retry', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response);
    const user = userEvent.setup();
    render(<ReferenceLabels result={result()} />);

    await user.click(screen.getAllByRole('button', { name: 'Not comparable' })[0]);
    await user.click(screen.getByRole('button', { name: 'Externals' }));

    expect(await screen.findByText(/could not be saved/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Externals' })).toBeInTheDocument();
  });

  // The two sides were only ever tested against hand-written fixtures that resembled each
  // other by construction. This is the seam a per-task review cannot see: the body the
  // component actually builds, run through the validation that actually guards the corpus.
  it('builds a body the server accepts', async () => {
    const user = userEvent.setup();
    render(<ReferenceLabels result={result()} />);

    await user.click(screen.getAllByRole('button', { name: 'Not comparable' })[0]);
    await user.click(screen.getByRole('button', { name: 'Externals' }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];

    expect(parseSubmission(JSON.parse(String((init as RequestInit).body)))).not.toBeNull();
  });

  // The unscorable reference is the illegitimate comparison — the one the corpus needs most.
  it('still builds an acceptable body when the reference could not be scored', async () => {
    const unscored = result();
    unscored.topPlayers[0].provenance = {
      ...unscored.topPlayers[0].provenance,
      ilvl: null,
      distance: Number.POSITIVE_INFINITY,
      disqualifiedBy: [],
      tierPieces: 4,
      externalUptime: 0,
    };

    const user = userEvent.setup();
    render(<ReferenceLabels result={unscored} />);

    await user.click(screen.getAllByRole('button', { name: 'Not comparable' })[0]);
    await user.click(screen.getByRole('button', { name: 'Item level' }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const sent = JSON.parse(String((init as RequestInit).body));

    expect(sent.scores.distance).toBeNull();
    expect(parseSubmission(sent)).not.toBeNull();
    expect(await screen.findByText('Recorded')).toBeInTheDocument();
  });

  // The component is not remounted when the sidebar switches boss: only `result` changes.
  // Keyed by rank, a recorded state would claim a write that never happened for this one.
  it('does not carry a recorded state over to another boss', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ReferenceLabels result={result()} />);

    await user.click(screen.getAllByRole('button', { name: 'Not comparable' })[0]);
    await user.click(screen.getByRole('button', { name: 'Externals' }));
    expect(await screen.findByText('Recorded')).toBeInTheDocument();

    const otherBoss = result();
    otherBoss.topPlayers = [topPlayer('Cedran', 3), topPlayer('Doran', 4)];
    rerender(<ReferenceLabels result={otherBoss} />);

    expect(screen.queryByText('Recorded')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Not comparable' })).toHaveLength(2);
  });

  // C'est la carte qui demande le plus au lecteur — le signalement d'une comparaison injuste
  // est la seule donnée que le corpus ne reconstitue pas seul. Disparaître sans un mot se lit
  // comme une carte cassée, pas comme une sélection qui n'a rien gardé.
  it('dit qu’il n’y a rien à contester plutôt que de disparaître', () => {
    const empty = { ...result(), topPlayers: [] };
    render(<ReferenceLabels result={empty} />);

    expect(screen.getByText(/Nothing to challenge/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Not comparable' })).not.toBeInTheDocument();
  });
});
