import type { BossResult, CharacterStats, ReferenceSample } from '@/types';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CohortFilterPanel } from '../CohortFilterPanel';

function stats(over: Partial<CharacterStats> = {}): CharacterStats {
  return {
    name: 'Ref',
    avgIlvl: 640,
    primaryStat: 13000,
    crit: 4000,
    haste: 3500,
    mastery: 5800,
    vers: 800,
    talents: {},
    ...over,
  };
}

function entry(name: string, over: Partial<ReferenceSample> = {}): ReferenceSample {
  return {
    name,
    code: `code-${name}`,
    fightID: 1,
    actorId: 4,
    stats: stats({ name, ...(over.stats ?? {}) }),
    dps: 300000,
    killTimeMs: 200000,
    qualified: true,
    tierPieces: 2,
    externalUptime: 0,
    explored: false,
    ...over,
  };
}

/** `Faraway` est à six ilvl : tout réglage sous ±6 l'écarte, et il est aussi une référence
 *  détaillée — c'est ce qui fait de lui le cas qui doit être nommé. */
const SAMPLE = [
  entry('Nearby'),
  entry('Faraway', { stats: stats({ name: 'Faraway', avgIlvl: 646 }) }),
  entry('Boosted', { qualified: false, externalUptime: 40 }),
];

function resultOf(sample: ReferenceSample[] = SAMPLE): BossResult {
  return {
    character: { stats: stats({ name: 'Me' }), dps: 280000 },
    comparability: { myKillTimeMs: 200000 },
    sample,
    topPlayers: sample.map((s) => ({
      provenance: { code: s.code, fightID: s.fightID, actorId: s.actorId, name: s.name },
    })),
  } as unknown as BossResult;
}

const slider = (name: RegExp) => screen.getByRole('slider', { name });
const summary = () => screen.getByText(/verified candidates/).closest('p');

describe('cohortFilterPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('opens on the selection: every qualified candidate, and nothing to reset', () => {
    render(<CohortFilterPanel result={resultOf()} />);

    // Deux qualifiés sur trois vérifiés : le disqualifié reste dehors tant qu'on ne le
    // demande pas, exactement comme la sélection l'a vu.
    expect(summary()).toHaveTextContent('Cohort: 2 of 3 verified candidates');
    expect(screen.getByRole('button', { name: /reset/i })).toBeDisabled();
    expect(screen.getByRole('row', { name: /Nearby/ })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Faraway/ })).toBeInTheDocument();
  });

  it('narrows the cohort without a single request', () => {
    render(<CohortFilterPanel result={resultOf()} />);

    fireEvent.change(slider(/item level/i), { target: { value: '0' } });

    expect(screen.queryByRole('row', { name: /Faraway/ })).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Nearby/ })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('names the detailed reference a filter has just thrown out', () => {
    render(<CohortFilterPanel result={resultOf()} />);

    expect(screen.queryByText(/still compare you against/)).not.toBeInTheDocument();

    fireEvent.change(slider(/item level/i), { target: { value: '0' } });

    const warning = screen.getByText(/still compare you against/);
    expect(warning).toHaveTextContent('Faraway');
    expect(warning).not.toHaveTextContent('Nearby');
  });

  it('takes the disqualified back in when they are asked for, and says they did not qualify', async () => {
    const user = userEvent.setup();
    render(<CohortFilterPanel result={resultOf()} />);

    await user.click(screen.getByRole('checkbox'));

    expect(screen.getByRole('row', { name: /Boosted/ })).toHaveTextContent('not qualified');
    expect(screen.getByRole('button', { name: /reset/i })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /reset/i }));

    expect(screen.queryByRole('row', { name: /Boosted/ })).not.toBeInTheDocument();
  });

  it('says an empty cohort is empty rather than falling back on the disqualified', () => {
    render(<CohortFilterPanel result={resultOf([SAMPLE[2]])} />);

    expect(screen.getByText(/No verified candidate matches these settings/)).toBeInTheDocument();
    expect(screen.getByText('No comparable logs')).toBeInTheDocument();
  });

  it('has nothing to tune when the search verified nobody', () => {
    render(<CohortFilterPanel result={resultOf([])} />);

    expect(screen.getByText(/Nothing to tune/)).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });
});
