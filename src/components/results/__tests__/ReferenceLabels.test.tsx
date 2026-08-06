import type { BossResult, ReferenceProvenance, TopPlayer } from '@/types';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSubmission } from '@/lib/labels/schema';
import { ReferenceLabels } from '../ReferenceLabels';

function provenance(name: string, rank: number): ReferenceProvenance {
  return {
    code: `code-${name}`,
    fightID: rank,
    name,
    ilvl: 285,
    killTimeMs: 317924,
    dps: 123456,
    distance: 0.42,
    disqualifiedBy: [],
    tierPieces: 4,
    externalUptime: 0,
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
    rotation: { name, dps: 123456, fightDurationMs: 317924, casts: {}, buffs: {} },
    damageTable: { entries: [] },
    provenance: provenance(name, rank),
  };
}

function result(): BossResult {
  return {
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
      rotation: { name: 'Jumbaa', dps: 105538, fightDurationMs: 326876, casts: {}, buffs: {} },
      damageTable: { entries: [] },
      dps: 105538,
      bossDps: null,
      killTime: '5:26',
      overallPct: null,
      overallPctOf: null,
      todayPct: null,
      bossDpsPct: null,
      bracket: null,
      source: { code: 'abc', fightID: 17, actorId: 63 },
      eligibility: { tierPieces: 4, externalUptime: 0, externals: [] },
    },
    topPlayers: [topPlayer('Aidan', 1), topPlayer('Baldan', 2)],
    sample: [],
    comparability: {
      level: 'close',
      referenceIlvl: 285,
      myIlvl: 284.1,
      referenceKillTimeMs: 317924,
      myKillTimeMs: 326876,
      candidatesConsidered: 981,
      pagesFetched: 10,
      disqualified: 0,
      substituted: 0,
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
    expect(sent.reference.name).toBe('Baldan');
    expect(sent.scores.rank).toBe(2);
    expect(sent.subject).toEqual({
      code: 'abc',
      fightID: 17,
      actorId: 63,
      ilvl: 284.1,
      killTimeMs: 326876,
      // Le palier et l'uptime du sujet, sans quoi le verdict sur la référence ne se relit pas.
      tierPieces: 4,
      externalUptime: 0,
    });
    expect(sent.reference).toMatchObject({
      tierPieces: 4,
      externalUptime: 0,
      disqualifiedBy: [],
    });
    // Signed, reference − subject: these references are better geared and faster.
    expect(sent.scores.ilvlGap).toBeCloseTo(0.9, 5);
    expect(sent.scores.killTimeGapPct).toBeLessThan(0);
    expect(sent.pool).toEqual({ candidatesConsidered: 981, pagesFetched: 10, level: 'close' });
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
    otherBoss.topPlayers = [topPlayer('Cedran', 1), topPlayer('Doran', 2)];
    rerender(<ReferenceLabels result={otherBoss} />);

    expect(screen.queryByText('Recorded')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Not comparable' })).toHaveLength(2);
  });

  it('renders nothing when there are no references', () => {
    const empty = { ...result(), topPlayers: [] };
    const { container } = render(<ReferenceLabels result={empty} />);

    expect(container).toBeEmptyDOMElement();
  });
});
