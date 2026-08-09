import type { AnalysisInput, ReportActor, ReportFight, ReportMeta } from '@/types';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeClient } from '@/components/HomeClient';
import { useAnalysis } from '@/hooks/useAnalysis';
import { useReportAnalysis } from '@/hooks/useReportAnalysis';
import { useReportMeta } from '@/hooks/useReportMeta';
import { useZones } from '@/hooks/useZones';

/*
 * `HomeClient` ne calcule rien : il choisit quel écran répond à un état, et il écrit l'URL
 * qui produira l'état suivant. Ce sont ces deux décisions qui sont fixées ici. Les hooks de
 * données sont doublés — ils ont leurs propres tests — mais `useRouteSync` reste réel :
 * c'est lui qui relie l'URL au démarrage d'une analyse, et ce lien est le sujet.
 */
const push = vi.fn();
const replace = vi.fn();
let params: URLSearchParams;
let sessionState: { data: unknown; status: 'authenticated' | 'unauthenticated' | 'loading' };

const actor: ReportActor = {
  id: 63,
  name: 'Jumbaa',
  type: 'Player',
  subType: 'Priest',
  server: 'Ysondre',
};
const otherActor: ReportActor = { ...actor, id: 77, name: 'Altchar' };

function routerDouble() {
  return { push, replace };
}
function searchParamsDouble() {
  return params;
}
function sessionDouble() {
  return sessionState;
}

/* Chaque écran est réduit à sa marque, plus les props dont l'absence serait un défaut. */
function LandingDouble() {
  return <div data-testid="landing" />;
}
function BetaClosedDouble() {
  return <div data-testid="beta-closed" />;
}
function ModeSelectorDouble({ onSelect }: { onSelect: (m: 'character' | 'report') => void }) {
  return (
    <div data-testid="mode">
      <button type="button" onClick={() => onSelect('character')}>
        character
      </button>
      <button type="button" onClick={() => onSelect('report')}>
        report
      </button>
    </div>
  );
}
function AnonFormDouble() {
  return <div data-testid="anon-form" />;
}
function LoggedInFormDouble({
  onSubmit,
}: {
  onSubmit: (i: AnalysisInput, zoneId: number) => void;
}) {
  return (
    <button
      type="button"
      data-testid="logged-form"
      onClick={() =>
        onSubmit(
          {
            characterName: 'Jumbaa',
            serverSlug: 'ysondre',
            region: 'EU',
            difficulty: 5,
            encounters: [{ id: 3306, name: 'Chimaerus' }],
            specId: 258,
          },
          42
        )
      }
    >
      submit
    </button>
  );
}
function ReportFormDouble() {
  return <div data-testid="report-form" />;
}
function CharacterDashboardDouble({
  activeBossIdx,
  onReset,
  onSwitchCharacter,
}: {
  activeBossIdx: number;
  onReset: () => void;
  onSwitchCharacter?: (n: string, r: string) => void;
}) {
  return (
    <div data-testid="char-dashboard" data-boss-idx={activeBossIdx}>
      <button type="button" onClick={onReset}>
        reset
      </button>
      {onSwitchCharacter && (
        <button type="button" onClick={() => onSwitchCharacter('Altchar', 'hyjal')}>
          switch
        </button>
      )}
    </div>
  );
}
function ReportDashboardDouble({
  actorName,
  activeBossIdx,
  onBossChange,
  onSwitchActor,
  onReset,
}: {
  actorName: string;
  activeBossIdx: number;
  onBossChange: (i: number) => void;
  onSwitchActor: (a: ReportActor) => void;
  onReset: () => void;
}) {
  return (
    <div data-testid="report-dashboard" data-boss-idx={activeBossIdx}>
      <span>{actorName}</span>
      <button type="button" onClick={() => onBossChange(1)}>
        boss
      </button>
      <button type="button" onClick={() => onSwitchActor(otherActor)}>
        actor
      </button>
      <button type="button" onClick={onReset}>
        reset
      </button>
    </div>
  );
}

vi.mock('next/navigation', () => ({
  useRouter: routerDouble,
  useSearchParams: searchParamsDouble,
}));
vi.mock('next-auth/react', () => ({ useSession: sessionDouble }));
vi.mock('@/hooks/useZones', () => ({ useZones: vi.fn() }));
vi.mock('@/hooks/useAnalysis', () => ({ useAnalysis: vi.fn() }));
vi.mock('@/hooks/useReportAnalysis', () => ({ useReportAnalysis: vi.fn() }));
vi.mock('@/hooks/useReportMeta', () => ({ useReportMeta: vi.fn() }));
vi.mock('@/components/landing/MarketingLanding', () => ({ MarketingLanding: LandingDouble }));
vi.mock('@/components/auth/BetaClosedScreen', () => ({ BetaClosedScreen: BetaClosedDouble }));
vi.mock('@/components/ui/ModeSelector', () => ({ ModeSelector: ModeSelectorDouble }));
vi.mock('@/components/forms/CharacterForm', () => ({ CharacterForm: AnonFormDouble }));
vi.mock('@/components/forms/LoggedInCharacterForm', () => ({
  LoggedInCharacterForm: LoggedInFormDouble,
}));
vi.mock('@/components/forms/ReportForm', () => ({ ReportForm: ReportFormDouble }));
vi.mock('@/components/character/CharacterDashboard', () => ({
  CharacterDashboard: CharacterDashboardDouble,
}));
vi.mock('@/components/report/ReportDashboard', () => ({
  ReportDashboard: ReportDashboardDouble,
}));

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

const reportMeta: ReportMeta = {
  title: 'Raid night',
  fights: [fight(), fight({ id: 2, encounterID: 3307, name: 'Fractillus' })],
  actors: [actor, otherActor],
};

const input: AnalysisInput = {
  characterName: 'Jumbaa',
  serverSlug: 'ysondre',
  region: 'EU',
  difficulty: 5,
  encounters: [
    { id: 3306, name: 'Chimaerus' },
    { id: 3307, name: 'Fractillus' },
  ],
  specId: 258,
};

/* La spec du résultat diffère de celle de l'URL : c'est ce qui départage les deux sources. */
const reportResultDouble = { bosses: [], input: { specId: 102 } };

const start = vi.fn();
const startReport = vi.fn();
const reset = vi.fn();
const resetReport = vi.fn();
const fetchMeta = vi.fn();

function mockHooks({
  analysisInput = null,
  reportResult = null,
  reportLoading = false,
  meta = null,
  fetchedCode = null,
}: {
  analysisInput?: AnalysisInput | null;
  reportResult?: unknown;
  reportLoading?: boolean;
  meta?: ReportMeta | null;
  fetchedCode?: string | null;
} = {}) {
  vi.mocked(useZones).mockReturnValue({
    zones: [{ id: 42, name: 'Manaforge Omega', encounters: input.encounters }],
    loading: false,
    error: null,
    retry: vi.fn(),
  });
  vi.mocked(useAnalysis).mockReturnValue({
    bossStates: [],
    currentDifficulty: 5,
    isAnyLoading: false,
    input: analysisInput,
    start,
    switchBossSpec: vi.fn(),
    changeDifficulty: vi.fn(),
    reset,
  } as unknown as ReturnType<typeof useAnalysis>);
  vi.mocked(useReportAnalysis).mockReturnValue({
    result: reportResult,
    loading: reportLoading,
    error: null,
    start: startReport,
    reset: resetReport,
  } as unknown as ReturnType<typeof useReportAnalysis>);
  vi.mocked(useReportMeta).mockReturnValue({
    meta,
    fetchedCode,
    loading: false,
    error: null,
    fetchMeta,
  } as unknown as ReturnType<typeof useReportMeta>);
}

/** L'URL que le dernier `push` a demandée, en paramètres lisibles. */
function pushedParams(): URLSearchParams {
  const url = push.mock.calls[push.mock.calls.length - 1][0] as string;
  return new URLSearchParams(url.split('?')[1] ?? '');
}

describe('homeClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    params = new URLSearchParams();
    sessionState = { data: { user: { name: 'Jumbaa' } }, status: 'authenticated' };
    mockHooks();
  });

  describe('which screen answers which state', () => {
    it('sells the product to a visitor who is not signed in', () => {
      sessionState = { data: null, status: 'unauthenticated' };
      render(<HomeClient />);

      expect(screen.getByTestId('landing')).toBeInTheDocument();
    });

    it('shows the beta-closed screen instead of the landing page when signIn refused the account', () => {
      sessionState = { data: null, status: 'unauthenticated' };
      params = new URLSearchParams({ error: 'AccessDenied' });
      render(<HomeClient />);

      expect(screen.getByTestId('beta-closed')).toBeInTheDocument();
      expect(screen.queryByTestId('landing')).not.toBeInTheDocument();
    });

    it('says something is happening while the session resolves', () => {
      sessionState = { data: null, status: 'loading' };
      render(<HomeClient />);

      // Une page blanche serait indiscernable d'une panne.
      expect(screen.getByText('Loading…')).toBeInTheDocument();
      expect(screen.queryByTestId('landing')).not.toBeInTheDocument();
    });

    it('asks which of the two paths to take before showing a form', () => {
      render(<HomeClient />);

      expect(screen.getByTestId('mode')).toBeInTheDocument();
    });

    it('opens the character form once that path is chosen', async () => {
      const user = userEvent.setup();
      render(<HomeClient />);

      await user.click(screen.getByRole('button', { name: 'character' }));

      expect(screen.getByTestId('logged-form')).toBeInTheDocument();
    });

    it('opens the report form on the other path', async () => {
      const user = userEvent.setup();
      render(<HomeClient />);

      await user.click(screen.getByRole('button', { name: 'report' }));

      expect(screen.getByTestId('report-form')).toBeInTheDocument();
    });

    it('shows the results as soon as an analysis has an input', () => {
      mockHooks({ analysisInput: input });
      render(<HomeClient />);

      expect(screen.getByTestId('char-dashboard')).toBeInTheDocument();
    });

    it('waits under a spinner while a shareable URL is being restored', () => {
      params = new URLSearchParams({ char: 'Jumbaa', server: 'ysondre', spec: '258' });
      render(<HomeClient />);

      expect(screen.getByText('Loading…')).toBeInTheDocument();
    });

    it('falls back to the form on a truncated URL rather than spinning forever', () => {
      // Sans `spec`, `useRouteSync` refuse de démarrer : le spinner ne finirait jamais.
      params = new URLSearchParams({ char: 'Jumbaa', server: 'ysondre' });
      render(<HomeClient />);

      expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
      expect(screen.getByTestId('mode')).toBeInTheDocument();
    });

    it('gives the report path priority over a character analysis left behind', () => {
      params = new URLSearchParams({ report: 'abc', actor: '63', spec: '258', difficulty: '5' });
      mockHooks({
        analysisInput: input,
        meta: reportMeta,
        fetchedCode: 'abc',
        reportResult: reportResultDouble,
      });
      render(<HomeClient />);

      expect(screen.getByTestId('report-dashboard')).toBeInTheDocument();
      expect(screen.queryByTestId('char-dashboard')).not.toBeInTheDocument();
    });

    it('shows the report shell while its analysis is still running', () => {
      params = new URLSearchParams({ report: 'abc', actor: '63', spec: '258', difficulty: '5' });
      mockHooks({ meta: reportMeta, fetchedCode: 'abc', reportLoading: true });
      render(<HomeClient />);

      expect(screen.getByTestId('report-dashboard')).toBeInTheDocument();
      expect(screen.getByText('Jumbaa')).toBeInTheDocument();
    });

    it('does not open a report dashboard on a stale meta from another report', () => {
      params = new URLSearchParams({ report: 'xyz', actor: '63', spec: '258', difficulty: '5' });
      mockHooks({ meta: reportMeta, fetchedCode: 'abc', reportResult: reportResultDouble });
      render(<HomeClient />);

      expect(screen.queryByTestId('report-dashboard')).not.toBeInTheDocument();
    });
  });

  describe('the URL is the state', () => {
    it('writes every parameter needed to replay the analysis', async () => {
      const user = userEvent.setup();
      render(<HomeClient />);
      await user.click(screen.getByRole('button', { name: 'character' }));

      await user.click(screen.getByTestId('logged-form'));

      expect(Object.fromEntries(pushedParams())).toEqual({
        char: 'Jumbaa',
        server: 'ysondre',
        region: 'EU',
        difficulty: '5',
        zone: '42',
        spec: '258',
      });
    });

    it('starts the analysis the URL describes, without a form being filled', async () => {
      params = new URLSearchParams({
        char: 'Jumbaa',
        server: 'ysondre',
        spec: '258',
        difficulty: '5',
        zone: '42',
      });
      render(<HomeClient />);

      await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
      expect(start.mock.calls[0][0]).toMatchObject({
        characterName: 'Jumbaa',
        serverSlug: 'ysondre',
        specId: 258,
        difficulty: 5,
      });
    });

    it('keeps the character and drops the boss when the character changes', async () => {
      const user = userEvent.setup();
      params = new URLSearchParams({
        char: 'Jumbaa',
        server: 'ysondre',
        spec: '258',
        boss: '3307',
      });
      mockHooks({ analysisInput: input });
      render(<HomeClient />);

      await user.click(screen.getByRole('button', { name: 'switch' }));

      const next = pushedParams();
      expect(next.get('char')).toBe('Altchar');
      expect(next.get('server')).toBe('hyjal');
      // Le boss actif d'un joueur n'a pas de sens pour le suivant : il n'a peut-être pas le kill.
      expect(next.get('boss')).toBeNull();
      expect(next.get('spec')).toBe('258');
    });

    it('offers no character switch to a visitor who has no roster', () => {
      sessionState = { data: null, status: 'unauthenticated' };
      mockHooks({ analysisInput: input });
      render(<HomeClient />);

      expect(screen.queryByRole('button', { name: 'switch' })).not.toBeInTheDocument();
    });

    it('reads the active boss from the URL, not from a click', () => {
      params = new URLSearchParams({
        char: 'Jumbaa',
        server: 'ysondre',
        spec: '258',
        boss: '3307',
      });
      mockHooks({ analysisInput: input });
      render(<HomeClient />);

      expect(screen.getByTestId('char-dashboard')).toHaveAttribute('data-boss-idx', '1');
    });

    it('falls back to the first boss when the URL names one that was not analysed', () => {
      params = new URLSearchParams({ char: 'Jumbaa', server: 'ysondre', spec: '258', boss: '999' });
      mockHooks({ analysisInput: input });
      render(<HomeClient />);

      expect(screen.getByTestId('char-dashboard')).toHaveAttribute('data-boss-idx', '0');
    });

    it('replaces rather than pushes when only the boss changes', async () => {
      const user = userEvent.setup();
      params = new URLSearchParams({ report: 'abc', actor: '63', spec: '258', difficulty: '5' });
      mockHooks({ meta: reportMeta, fetchedCode: 'abc', reportResult: reportResultDouble });
      render(<HomeClient />);

      await user.click(screen.getByRole('button', { name: 'boss' }));

      // Lire un autre boss n'est pas une navigation : le retour arrière doit sortir du rapport.
      expect(replace).toHaveBeenCalledTimes(1);
      expect(new URLSearchParams(replace.mock.calls[0][0].split('?')[1]).get('boss')).toBe('3307');
    });

    it('re-analyses the report for the actor picked, and forgets the previous boss', async () => {
      const user = userEvent.setup();
      params = new URLSearchParams({ report: 'abc', actor: '63', spec: '258', difficulty: '5' });
      mockHooks({ meta: reportMeta, fetchedCode: 'abc', reportResult: reportResultDouble });
      render(<HomeClient />);

      await user.click(screen.getByRole('button', { name: 'actor' }));

      // La spec vient du résultat analysé, pas du `spec` de l'URL qui peut être en retard.
      expect(startReport).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'abc', actor: otherActor, specId: 102, difficulty: 5 })
      );
      expect(pushedParams().get('actor')).toBe('77');
      expect(pushedParams().get('boss')).toBeNull();
    });

    it('sends the reader home on reset, and clears what was analysed', async () => {
      const user = userEvent.setup();
      params = new URLSearchParams({ char: 'Jumbaa', server: 'ysondre', spec: '258' });
      mockHooks({ analysisInput: input });
      render(<HomeClient />);

      await user.click(screen.getByRole('button', { name: 'reset' }));

      expect(reset).toHaveBeenCalledTimes(1);
      expect(push).toHaveBeenCalledWith('/');
    });

    it('clears the report the same way, and returns to the path choice', async () => {
      const user = userEvent.setup();
      params = new URLSearchParams({ report: 'abc', actor: '63', spec: '258', difficulty: '5' });
      mockHooks({ meta: reportMeta, fetchedCode: 'abc', reportResult: reportResultDouble });
      render(<HomeClient />);

      await user.click(screen.getByRole('button', { name: 'reset' }));

      expect(resetReport).toHaveBeenCalledTimes(1);
      expect(push).toHaveBeenCalledWith('/');
    });
  });
});
