import type { BossState } from '@/hooks/useAnalysis';
import type { AnalysisInput, BossResult, Comparability } from '@/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BossContentPanel } from '../BossContentPanel';

/*
 * Les trois onglets et la barre latérale sont testés chez eux. Ici on ne vérifie que les
 * décisions du panneau : quel onglet est monté, quel boss lui est passé, et à qui le
 * sélecteur de spec est offert. Les doubles rendent ces choix lisibles sans rendre les
 * sous-arbres entiers.
 */
function OverviewDouble({
  encounter,
  specName,
  onRetry,
}: {
  encounter: { name: string };
  specName: string;
  onRetry?: () => void;
}) {
  return (
    <div data-testid="overview">
      {`${encounter.name} / ${specName}`}
      {onRetry && (
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
function ComparisonDouble({ encounter }: { encounter: { name: string } }) {
  return <div data-testid="comparison">{encounter.name}</div>;
}
function AIReportDouble({ activeBossResult }: { activeBossResult: BossResult | null }) {
  return <div data-testid="ai-report">{activeBossResult?.encounter ?? 'none'}</div>;
}
function SidebarDouble({ activeIdx }: { activeIdx: number }) {
  return <div data-testid="sidebar">{String(activeIdx)}</div>;
}
function VerdictDouble({ result }: { result: BossResult }) {
  return <div data-testid="verdict">{result.encounter}</div>;
}
function DpsDouble({ dps, ilvl }: { dps: number; ilvl: number | null }) {
  return (
    <div data-testid="dps">
      {dps}
      {ilvl !== null && <span data-testid="dps-ilvl">{ilvl}</span>}
    </div>
  );
}

vi.mock('@/components/results/OverviewTab', () => ({ OverviewTab: OverviewDouble }));
vi.mock('@/components/results/ComparisonTab', () => ({ ComparisonTab: ComparisonDouble }));
vi.mock('@/components/ai/AIReportTab', () => ({ AIReportTab: AIReportDouble }));
vi.mock('@/components/results/BossSidebar', () => ({ BossSidebar: SidebarDouble }));
vi.mock('@/components/results/VerdictBanner', () => ({ VerdictBanner: VerdictDouble }));
vi.mock('@/components/results/DpsBanner', () => ({ DpsBanner: DpsDouble }));

const DRUID_BALANCE = 102;
const SHADOW_PRIEST = 258;

/**
 * `character` est là pour le seul `DpsBanner`, que le panneau monte désormais lui-même ; le
 * reste — `comparability`, `sample`, `topPlayers` — parce que le panneau consulte le verdict
 * pour savoir si l'ilvl y est déjà énoncé. `referenceIlvl` par défaut à `null` : le verdict
 * se tait alors, et l'ilvl revient au bandeau. Les cas qui l'y font parler le surchargent.
 */
function bossResult(
  specId: number,
  encounter: string,
  comparability: Partial<Comparability> = {}
): BossResult {
  return {
    specId,
    encounter,
    encounterId: 1,
    character: {
      dps: 100000,
      stats: { avgIlvl: 285, name: 'Jumbaa' },
      context: null,
      source: { code: 'aBcD1234', fightID: 3, actorId: 12 },
    },
    sample: [{ dps: 120000, qualified: true }],
    topPlayers: [],
    comparability: {
      level: 'close',
      referenceIlvl: null,
      referenceIlvlCount: 0,
      myIlvl: 285,
      referenceKillTimeMs: null,
      myKillTimeMs: 300_000,
      candidatesConsidered: 40,
      pagesFetched: 1,
      disqualified: 0,
      unverifiable: 0,
      substituted: 0,
      poolDps: null,
      poolIlvl: null,
      poolIlvlCount: 0,
      ...comparability,
    },
  } as unknown as BossResult;
}

function ok(
  specId: number,
  encounter: string,
  comparability: Partial<Comparability> = {}
): BossState {
  return { status: 'success', result: bossResult(specId, encounter, comparability) };
}

const input = { characterName: 'Jumbaa', specId: DRUID_BALANCE } as AnalysisInput;

type PanelProps = Parameters<typeof BossContentPanel>[0];

/**
 * L'onglet ouvert est une prop : c'est l'URL qui le porte, chez les deux clients de résultat.
 * Cet hôte rejoue ce contrat — il tient l'état que le panneau ne tient plus — pour que les cas
 * qui cliquent un onglet mesurent encore ce qu'ils mesuraient. Les cas qui vérifient que le
 * panneau, lui, ne retient rien montent le panneau nu.
 */
function TabHost(props: PanelProps) {
  const [tab, setTab] = useState(props.activeTab);
  return (
    <BossContentPanel
      {...props}
      activeTab={tab}
      onTabChange={(next) => {
        setTab(next);
        props.onTabChange(next);
      }}
    />
  );
}

function panelProps(over: Partial<PanelProps> = {}): PanelProps {
  return {
    encounters: [
      { id: 1, name: 'Chimaerus' },
      { id: 2, name: 'Fractillus' },
    ],
    bossStates: [ok(DRUID_BALANCE, 'Chimaerus'), ok(DRUID_BALANCE, 'Fractillus')],
    activeBossIdx: 0,
    onBossChange: vi.fn(),
    activeTab: 'overview',
    onTabChange: vi.fn(),
    analysisResult: { input, bosses: [], generatedAt: '2026-01-01T00:00:00.000Z' },
    ...over,
  };
}

function renderPanel(over: Partial<PanelProps> = {}) {
  const props = panelProps(over);
  return { props, ...render(<TabHost {...props} />) };
}

describe('bossContentPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens on the overview, not on a tab that costs a provider call', () => {
    renderPanel();

    expect(screen.getByTestId('overview')).toBeInTheDocument();
    expect(screen.queryByTestId('ai-report')).not.toBeInTheDocument();
  });

  it('opens on the tab it is given, so a link can point at the gap it shows', () => {
    renderPanel({ activeTab: 'comparison' });

    expect(screen.getByTestId('comparison')).toBeInTheDocument();
    expect(screen.queryByTestId('overview')).not.toBeInTheDocument();
  });

  it('asks for the tab instead of remembering it', async () => {
    // Le panneau nu, sans hôte : l'onglet cliqué ne s'ouvre que si quelqu'un réécrit l'URL.
    // C'est ce qui empêche un lien collé et un clic de suivre deux chemins différents.
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    render(<BossContentPanel {...panelProps({ onTabChange })} />);

    await user.click(screen.getByRole('tab', { name: 'Comparison' }));

    expect(onTabChange).toHaveBeenCalledWith('comparison');
    expect(screen.getByTestId('overview')).toBeInTheDocument();
  });

  it('mounts one tab at a time', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('tab', { name: 'Comparison' }));

    expect(screen.getByTestId('comparison')).toBeInTheDocument();
    expect(screen.queryByTestId('overview')).not.toBeInTheDocument();
  });

  it('gives the tabs the boss the sidebar points at', () => {
    renderPanel({ activeBossIdx: 1 });

    expect(screen.getByTestId('overview')).toHaveTextContent('Fractillus');
    expect(screen.getByTestId('sidebar')).toHaveTextContent('1');
  });

  it('states the verdict on the boss in view, above the tabs', () => {
    renderPanel({ activeBossIdx: 1 });

    const verdict = screen.getByTestId('verdict');
    expect(verdict).toHaveTextContent('Fractillus');
    // Le verdict précède la barre d'onglets dans l'ordre du document : le lecteur n'a pas à
    // choisir un onglet pour savoir s'il a quelque chose à apprendre.
    expect(verdict.compareDocumentPosition(screen.getByRole('tab', { name: 'Overview' }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  // Le chiffre était monté une fois par onglet, en plus du verdict qui l'énonce : trois
  // lectures du même DPS. Il est maintenant au-dessus des onglets, comme le verdict.
  it('ne fait lire le DPS qu’une fois, sur tous les onglets', async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(screen.getAllByTestId('dps')).toHaveLength(1);

    await user.click(screen.getByRole('tab', { name: 'Comparison' }));
    expect(screen.getAllByTestId('dps')).toHaveLength(1);

    await user.click(screen.getByRole('tab', { name: 'AI Report' }));
    expect(screen.getAllByTestId('dps')).toHaveLength(1);
  });

  // Point 2 de la vérification manuelle : `285 ilvl` se lisait deux fois dans le même bloc,
  // une fois dans le verdict et une fois sous le DPS. Le bandeau ne le porte donc plus que
  // lorsque le verdict se tait — et il le porte alors vraiment, car c'est un critère de
  // comparabilité, pas un ornement.
  it('tait l’ilvl sous le DPS quand le verdict l’énonce déjà', () => {
    renderPanel({ bossStates: [ok(DRUID_BALANCE, 'Chimaerus', { referenceIlvl: 290 })] });

    expect(screen.queryByTestId('dps-ilvl')).not.toBeInTheDocument();
  });

  it('rend l’ilvl sous le DPS quand le verdict n’a pas de quoi le citer', () => {
    renderPanel();

    expect(screen.getByTestId('dps-ilvl')).toHaveTextContent('285');
  });

  // L'aveu que la comparaison ne tient pas est la seule position que le §2 de
  // `PRODUCT_CONTEXT.md` tient pour défendable. Rangé dans l'onglet Comparison, il ne se
  // lisait qu'après un clic : il ouvre désormais le bloc, avant même le verdict.
  it('avoue la légitimité de la comparaison avant tout le reste, hors des onglets', async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(
      screen.getByText('Comparison basis').compareDocumentPosition(screen.getByTestId('verdict'))
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    await user.click(screen.getByRole('tab', { name: 'Comparison' }));
    expect(screen.getByText('Comparison basis')).toBeInTheDocument();
  });

  it('says nothing while the boss is still loading', () => {
    renderPanel({ bossStates: [{ status: 'loading' }, { status: 'loading' }] });

    expect(screen.queryByTestId('verdict')).not.toBeInTheDocument();
  });

  it('falls back to the last encounter rather than rendering an empty panel', () => {
    // Un `boss` d'URL pointant hors de la liste ne doit pas vider l'écran.
    renderPanel({ activeBossIdx: 9 });

    expect(screen.getByTestId('overview')).toHaveTextContent('Fractillus');
  });

  it('hands the AI tab the boss in view, so the report is about what is read', async () => {
    const user = userEvent.setup();
    renderPanel({ activeBossIdx: 1 });

    await user.click(screen.getByRole('tab', { name: 'AI Report' }));

    expect(screen.getByTestId('ai-report')).toHaveTextContent('Fractillus');
  });

  it('drops the sidebar on the AI tab, which carries its own boss picker', async () => {
    const user = userEvent.setup();
    renderPanel();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'AI Report' }));

    expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument();
  });

  it('shows no sidebar when the analysis covers no encounter', () => {
    renderPanel({ encounters: [], bossStates: [] });

    expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument();
  });

  it('names the spec once the result carries one', () => {
    renderPanel();

    expect(screen.getByTestId('overview')).toHaveTextContent('Balance Druid');
  });

  it('says Unknown rather than guessing a spec while the boss is still loading', () => {
    renderPanel({ bossStates: [{ status: 'loading' }, { status: 'loading' }] });

    expect(screen.getByTestId('overview')).toHaveTextContent('Unknown');
  });

  it('offers the spec switcher only where a re-analysis is possible', () => {
    // Sans `onSwitchBossSpec` — le chemin rapport — changer de spec n'a personne à appeler.
    renderPanel({ onSwitchBossSpec: undefined });

    expect(screen.queryByRole('button', { name: 'Feral' })).not.toBeInTheDocument();
  });

  it('lists the dps specs of the class when a switch is possible', () => {
    renderPanel({ onSwitchBossSpec: vi.fn() });

    expect(screen.getByRole('button', { name: 'Balance' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Feral' })).toBeInTheDocument();
  });

  it('marks the spec on display, and only that one', () => {
    // La spec active n'était signalée que par sa couleur de fond : rien ne la distinguait
    // pour qui ne la voit pas.
    renderPanel({ onSwitchBossSpec: vi.fn() });

    expect(screen.getByRole('button', { name: 'Balance' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Feral' })).not.toHaveAttribute('aria-current');
  });

  it('hides the switcher for a class with a single dps spec', () => {
    renderPanel({
      onSwitchBossSpec: vi.fn(),
      bossStates: [ok(SHADOW_PRIEST, 'Chimaerus'), ok(SHADOW_PRIEST, 'Fractillus')],
    });

    expect(screen.queryByRole('button', { name: 'Shadow' })).not.toBeInTheDocument();
  });

  it('asks for the new spec on the boss in view, not on the first one', async () => {
    const user = userEvent.setup();
    const onSwitchBossSpec = vi.fn();
    renderPanel({ onSwitchBossSpec, activeBossIdx: 1 });

    await user.click(screen.getByRole('button', { name: 'Feral' }));

    expect(onSwitchBossSpec).toHaveBeenCalledWith(1, 103);
  });

  it('spends nothing when the spec already displayed is clicked again', async () => {
    const user = userEvent.setup();
    const onSwitchBossSpec = vi.fn();
    renderPanel({ onSwitchBossSpec });

    await user.click(screen.getByRole('button', { name: 'Balance' }));

    expect(onSwitchBossSpec).not.toHaveBeenCalled();
  });

  it('keeps the switcher visible while the re-analysis it triggered is loading', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderPanel({ onSwitchBossSpec: vi.fn() });

    await user.click(screen.getByRole('button', { name: 'Feral' }));
    // Le même hôte qu'au montage : rerendre un autre type de racine remonterait l'arbre, et
    // l'état local que ce cas mesure serait perdu pour une raison qui n'est pas la sienne.
    rerender(<TabHost {...props} bossStates={[{ status: 'loading' }, ok(102, 'F')]} />);

    // La spec choisie est retenue localement : sans cela le switcher disparaîtrait le temps
    // du chargement, juste après le clic qui l'a provoqué.
    const feral = screen.getByRole('button', { name: 'Feral' });
    expect(feral).toBeInTheDocument();
    expect(feral).toBeDisabled();
  });

  it('asks for the retry on the boss in view, not on the first one', async () => {
    const user = userEvent.setup();
    const onRetryBoss = vi.fn();
    renderPanel({ onRetryBoss, activeBossIdx: 1 });

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onRetryBoss).toHaveBeenCalledWith(1);
  });

  it('offers no retry where the path cannot re-run a single boss', () => {
    // Sans `onRetryBoss` — le chemin rapport — une reprise n'a personne à appeler.
    renderPanel();

    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  describe('carte de partage', () => {
    // Le vivier entier à 292 d'ilvl contre un sujet à 285 : c'est l'écart de matériel que la
    // carte montre, et sans lui elle affirmerait sans démontrer.
    const shareable = { referenceIlvl: 285, poolDps: 155000, poolIlvl: 292, poolIlvlCount: 900 };

    it("n'offre rien à partager quand le panel ne porte pas d'écart chiffrable", () => {
      renderPanel();

      expect(screen.queryByRole('button', { name: 'Share card' })).not.toBeInTheDocument();
    });

    it('tient la carte repliée jusqu’au clic, puis la sort du résultat', async () => {
      const user = userEvent.setup();
      renderPanel({ bossStates: [ok(DRUID_BALANCE, 'Chimaerus', shareable)] });

      expect(screen.queryByText('Against comparable logs')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Share card' }));

      expect(screen.getByText('Against the field')).toBeInTheDocument();
      expect(screen.getByText('Against comparable logs')).toBeInTheDocument();
    });
  });

  describe('pull picker', () => {
    const pulls = {
      1: [
        { fightId: 11, fightMs: 200000 },
        { fightId: 12, fightMs: 160000 },
      ],
      2: [{ fightId: 21, fightMs: 180000 }],
    };

    it('offers the pull picker only where a re-analysis is possible', () => {
      // Sans `onSelectPull` — le chemin personnage — rechoisir une pull n'a personne à appeler.
      renderPanel({ pulls, onSelectPull: undefined });

      expect(screen.queryByLabelText('Pull')).not.toBeInTheDocument();
    });

    it('says nothing on an encounter killed once', () => {
      renderPanel({ pulls, onSelectPull: vi.fn(), activeBossIdx: 1 });

      expect(screen.queryByLabelText('Pull')).not.toBeInTheDocument();
    });

    it('ranks the pulls by their place in the evening, the most recent first', () => {
      // Aucun dps n'est connu avant analyse : le rang et la durée sont les seuls repères.
      renderPanel({ pulls, onSelectPull: vi.fn() });

      const options = screen.getAllByRole('option').map((o) => o.textContent);
      expect(options).toEqual(['Kill 2 of 2 · 2:40', 'Kill 1 of 2 · 3:20']);
    });

    it('shows the last kill as selected, which is the one analysed by default', () => {
      renderPanel({ pulls, onSelectPull: vi.fn() });

      expect(screen.getByLabelText('Pull')).toHaveValue('12');
    });

    it('shows the pull retained once another one has been chosen', () => {
      renderPanel({ pulls, selectedPull: { 1: 11 }, onSelectPull: vi.fn() });

      expect(screen.getByLabelText('Pull')).toHaveValue('11');
    });

    it('names the encounter it belongs to, not the index of the panel', async () => {
      const user = userEvent.setup();
      const onSelectPull = vi.fn();
      renderPanel({ pulls, onSelectPull });

      await user.selectOptions(screen.getByLabelText('Pull'), '11');

      expect(onSelectPull).toHaveBeenCalledWith(1, 11);
    });
  });

  // Le testeur veut atteindre la source : ce que nous ne rendons pas — timeline, buffs,
  // autres joueurs — n'existe que sur WCL.
  describe('lien vers le log', () => {
    it('pointe le combat analysé, pas le rapport seul', () => {
      renderPanel();

      expect(screen.getByRole('link', { name: /Warcraft Logs/ })).toHaveAttribute(
        'href',
        'https://www.warcraftlogs.com/reports/aBcD1234#fight=3&source=12'
      );
    });

    it('ne s’affiche pas sans résultat à pointer', () => {
      renderPanel({ bossStates: [{ status: 'loading' }] });

      expect(screen.queryByRole('link', { name: /Warcraft Logs/ })).toBeNull();
    });
  });
});
