import type { BossResult, CharacterStats, ReferenceSample, TalentNode } from '@/types';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCohortState } from '@/hooks/useCohortState';
import { CohortFilterPanel } from '../CohortFilterPanel';
import { StatsTable } from '../StatsTable';
import { TalentDiff } from '../TalentDiff';

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

const NODE: TalentNode = {
  id: 1,
  talentIds: [1],
  name: 'Their Pick',
  names: ['Their Pick'],
  spellId: 1,
  row: 1,
  col: 0,
  maxRanks: 1,
  nodeType: 'single',
  treeType: 'spec',
  children: [],
};

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

/**
 * L'état de la cohorte vit dans `ComparisonTab`, parce que les cases gouvernent aussi la table
 * de stats et le diff de build. Le harnais reproduit ce câblage-là : sans les deux
 * consommateurs, un test ne pourrait pas montrer qu'ils suivent.
 */
function Harness({ result }: { result: BossResult }) {
  const cohort = useCohortState(result);
  return (
    <>
      <CohortFilterPanel result={result} cohort={cohort} />
      <StatsTable character={result.character.stats} sample={cohort.selected} chosen />
      <TalentDiff
        nodes={[NODE]}
        myTalents={result.character.stats.talents}
        references={cohort.selected}
      />
    </>
  );
}

const slider = (name: RegExp) => screen.getByRole('slider', { name });
const summary = () => screen.getByText(/verified candidates/).closest('p');
const box = (name: RegExp) => screen.getByRole('checkbox', { name });
/** Ce que la table de stats dit de son effectif — la preuve qu'elle suit les cases. */
const statsBasis = () => screen.getByText(/comparable logs/).closest('p');

describe('cohortFilterPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('opens on the selection: every qualified candidate shown, the best matches checked', () => {
    render(<Harness result={resultOf()} />);

    // Deux qualifiés sur trois vérifiés : le disqualifié reste dehors tant qu'on ne le
    // demande pas, exactement comme la sélection l'a vu. Les deux tiennent sous le plafond
    // de cinq, donc ils sont cochés d'emblée.
    expect(summary()).toHaveTextContent('2 checked');
    expect(summary()).toHaveTextContent('2 shown by the filter');
    expect(summary()).toHaveTextContent('3 verified candidates');
    expect(screen.getByRole('button', { name: /reset/i })).toBeDisabled();
    expect(box(/compare against nearby/i)).toBeChecked();
    expect(box(/compare against faraway/i)).toBeChecked();
  });

  it('checks only the five best matches when the field is larger', () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      entry(`Ref${i}`, { stats: stats({ name: `Ref${i}`, avgIlvl: 640 + i }) })
    );
    render(<Harness result={resultOf(many)} />);

    expect(summary()).toHaveTextContent('5 checked');
    expect(summary()).toHaveTextContent('7 shown by the filter');
    // Le classement est celui de la sélection d'origine : le plus proche en ilvl d'abord.
    expect(box(/compare against ref0/i)).toBeChecked();
    expect(box(/compare against ref4/i)).toBeChecked();
    expect(box(/compare against ref5/i)).not.toBeChecked();
    expect(box(/compare against ref6/i)).not.toBeChecked();
  });

  it('narrows the cohort without a single request', () => {
    render(<Harness result={resultOf()} />);

    fireEvent.change(slider(/item level/i), { target: { value: '0' } });

    expect(screen.queryByRole('row', { name: /Faraway/ })).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Nearby/ })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('makes the stats and the build follow the boxes, still without a request', async () => {
    const user = userEvent.setup();
    render(<Harness result={resultOf()} />);

    expect(statsBasis()).toHaveTextContent('2 comparable logs');

    await user.click(box(/compare against faraway/i));

    expect(summary()).toHaveTextContent('1 checked');
    expect(statsBasis()).toHaveTextContent('1 comparable logs');
    expect(screen.getByRole('button', { name: /reset/i })).toBeEnabled();
    expect(fetch).not.toHaveBeenCalled();

    // Plus rien de coché : les deux sections du dessous n'ont plus de champ à lire, et le
    // disent au lieu de comparer à un effectif qui n'existe pas.
    await user.click(box(/compare against nearby/i));

    expect(screen.getByText(/Nothing checked/)).toBeInTheDocument();
    expect(screen.getByText(/No comparable logs — showing your talents only/)).toBeInTheDocument();
  });

  it('names the detailed reference the cohort no longer includes', async () => {
    const user = userEvent.setup();
    render(<Harness result={resultOf()} />);

    expect(screen.queryByText(/still compare you against/)).not.toBeInTheDocument();

    await user.click(box(/compare against faraway/i));

    const warning = screen.getByText(/still compare you against/);
    expect(warning).toHaveTextContent('Faraway');
    expect(warning).not.toHaveTextContent('Nearby');
  });

  it('names it just as well when a slider is what threw it out', () => {
    render(<Harness result={resultOf()} />);

    fireEvent.change(slider(/item level/i), { target: { value: '0' } });

    expect(screen.getByText(/still compare you against/)).toHaveTextContent('Faraway');
  });

  it('takes the disqualified back in when they are asked for, and counts one that is checked', async () => {
    const user = userEvent.setup();
    render(<Harness result={resultOf()} />);

    await user.click(box(/eliminatory criteria/i));

    expect(screen.getByRole('row', { name: /Boosted/ })).toHaveTextContent('not qualified');
    // Coché à la main, il compte dans la distribution : `usableSample` écarterait un
    // disqualifié en silence, et un réglage qui ne change rien serait un réglage qui ment.
    expect(box(/compare against boosted/i)).toBeChecked();
    expect(statsBasis()).toHaveTextContent('3 comparable logs');

    await user.click(screen.getByRole('button', { name: /reset/i }));

    expect(screen.queryByRole('row', { name: /Boosted/ })).not.toBeInTheDocument();
    expect(statsBasis()).toHaveTextContent('2 comparable logs');
  });

  it('says an empty cohort is empty rather than falling back on the disqualified', () => {
    render(<Harness result={resultOf([SAMPLE[2]])} />);

    expect(screen.getByText(/No verified candidate matches these settings/)).toBeInTheDocument();
    expect(screen.getByText('No comparable logs')).toBeInTheDocument();
  });

  it('has nothing to tune when the search verified nobody', () => {
    render(<Harness result={resultOf([])} />);

    expect(screen.getByText(/Nothing to tune/)).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('says the spell screens keep comparing to the detailed references', () => {
    render(<Harness result={resultOf()} />);

    expect(
      screen.getByText(/the rotation cards, the damage table and the opening — stays on the/)
    ).toBeInTheDocument();
  });
});
