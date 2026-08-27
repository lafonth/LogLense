import type { AnalysisResult, ReportActor, ReportMeta } from '@/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportResultClient } from '@/components/report/ReportResultClient';
import { useReportAnalysis } from '@/hooks/useReportAnalysis';
import { useReportMeta } from '@/hooks/useReportMeta';

/*
 * Symétrique de `CharacterResultClient.test.tsx`. `useReportRouteSync` reste réel : c'est
 * lui qui relie l'URL — code, acteur, palier — au chargement de la méta puis au démarrage
 * de l'analyse. Les hooks de données sont doublés.
 */
const push = vi.fn();
const replace = vi.fn();
let params: URLSearchParams;

function routerDouble() {
  return { push, replace };
}
function searchParamsDouble() {
  return params;
}

const route = { code: 'aBcD1234', actorId: 7 };

const actor: ReportActor = {
  id: 7,
  name: 'Jumbaa',
  type: 'Player',
  subType: 'Druid',
  server: null,
};
const otherActor: ReportActor = {
  id: 8,
  name: 'Altchar',
  type: 'Player',
  subType: 'Priest',
  server: null,
};

function ReportDashboardDouble({
  actorName,
  activeBossIdx,
  activeTab,
  onTabChange,
  onReset,
  onSwitchActor,
  onDifficultyChange,
  onBossChange,
}: {
  actorName: string;
  activeBossIdx: number;
  activeTab: string;
  onTabChange: (t: string) => void;
  onReset: () => void;
  onSwitchActor: (actor: ReportActor) => void;
  onDifficultyChange: (d: number) => void;
  onBossChange: (i: number) => void;
}) {
  return (
    <div
      data-testid="report-dashboard"
      data-actor={actorName}
      data-boss-idx={activeBossIdx}
      data-tab={activeTab}
    >
      <button type="button" onClick={onReset}>
        reset
      </button>
      <button type="button" onClick={() => onTabChange('comparison')}>
        tab
      </button>
      <button type="button" onClick={() => onDifficultyChange(5)}>
        difficulty
      </button>
      <button type="button" onClick={() => onBossChange(1)}>
        boss
      </button>
      <button type="button" onClick={() => onSwitchActor(otherActor)}>
        switch
      </button>
    </div>
  );
}

vi.mock('next/navigation', () => ({
  useRouter: routerDouble,
  useSearchParams: searchParamsDouble,
}));
vi.mock('@/hooks/useReportMeta', () => ({ useReportMeta: vi.fn() }));
vi.mock('@/hooks/useReportAnalysis', () => ({ useReportAnalysis: vi.fn() }));
vi.mock('@/components/report/ReportDashboard', () => ({
  ReportDashboard: ReportDashboardDouble,
}));

const reportMeta: ReportMeta = {
  title: 'Manaforge Omega',
  actors: [actor, otherActor],
  fights: [
    {
      id: 1,
      name: 'Chimaerus',
      encounterID: 3306,
      kill: true,
      startTime: 0,
      endTime: 30000,
      difficulty: 4,
    },
    {
      id: 2,
      name: 'Fractillus',
      encounterID: 3307,
      kill: true,
      startTime: 30000,
      endTime: 60000,
      difficulty: 4,
    },
  ],
};

const result = { input: { specId: 258 } } as unknown as AnalysisResult;

const startReport = vi.fn();
const switchPull = vi.fn();
const fetchMeta = vi.fn();

function mockHooks({
  meta = null,
  fetchedCode = null,
  metaLoading = false,
  metaError = null,
  analysisResult = null,
  loading = false,
}: {
  meta?: ReportMeta | null;
  fetchedCode?: string | null;
  metaLoading?: boolean;
  metaError?: string | null;
  analysisResult?: AnalysisResult | null;
  loading?: boolean;
} = {}) {
  vi.mocked(useReportMeta).mockReturnValue({
    meta,
    fetchedCode,
    loading: metaLoading,
    error: metaError,
    fetchMeta,
    reset: vi.fn(),
  });
  vi.mocked(useReportAnalysis).mockReturnValue({
    result: analysisResult,
    loading,
    error: null,
    pullSelection: {},
    pullStatus: {},
    start: startReport,
    switchPull,
    reset: vi.fn(),
  });
}

/** L'URL que le dernier `push` (ou `replace`) a demandée, en paramètres lisibles. */
function calledParams(fn: typeof push) {
  const url = fn.mock.calls[fn.mock.calls.length - 1][0] as string;
  return new URLSearchParams(url.split('?')[1] ?? '');
}

describe('reportResultClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    params = new URLSearchParams({ spec: '258' });
    mockHooks();
  });

  it('shows the dashboard once the meta and the result are there', () => {
    mockHooks({ meta: reportMeta, fetchedCode: route.code, analysisResult: result });
    render(<ReportResultClient route={route} />);

    const dashboard = screen.getByTestId('report-dashboard');
    expect(dashboard).toBeInTheDocument();
    expect(dashboard).toHaveAttribute('data-actor', 'Jumbaa');
  });

  it('shows the dashboard shell while the analysis is still loading', () => {
    mockHooks({ meta: reportMeta, fetchedCode: route.code, loading: true });
    render(<ReportResultClient route={route} />);

    expect(screen.getByTestId('report-dashboard')).toBeInTheDocument();
  });

  it('falls back to an error screen on a truncated URL rather than spinning forever', () => {
    params = new URLSearchParams();
    render(<ReportResultClient route={route} />);

    expect(
      screen.getByText('This link is missing the spec it was analysed for.')
    ).toBeInTheDocument();
  });

  it('shows the report meta error with a retry button', async () => {
    const user = userEvent.setup();
    mockHooks({ metaError: 'Report not found' });
    render(<ReportResultClient route={route} />);

    expect(screen.getByText('Report not found')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(fetchMeta).toHaveBeenCalledWith(route.code);
  });

  it('reports when the report has no player with that actor id', () => {
    mockHooks({ meta: reportMeta, fetchedCode: route.code });
    params = new URLSearchParams({ spec: '258' });
    render(<ReportResultClient route={{ code: route.code, actorId: 999 }} />);

    expect(screen.getByText('This report has no player with that id.')).toBeInTheDocument();
  });

  it('reads the active boss from the URL', () => {
    params = new URLSearchParams({ spec: '258', boss: '3307' });
    mockHooks({ meta: reportMeta, fetchedCode: route.code, analysisResult: result });
    render(<ReportResultClient route={route} />);

    expect(screen.getByTestId('report-dashboard')).toHaveAttribute('data-boss-idx', '1');
  });

  it('reads the open tab from the URL, so a link can point at the gap it shows', () => {
    params = new URLSearchParams({ spec: '258', tab: 'comparison' });
    mockHooks({ meta: reportMeta, fetchedCode: route.code, analysisResult: result });
    render(<ReportResultClient route={route} />);

    expect(screen.getByTestId('report-dashboard')).toHaveAttribute('data-tab', 'comparison');
  });

  it('replaces rather than pushes when only the tab changes', async () => {
    const user = userEvent.setup();
    mockHooks({ meta: reportMeta, fetchedCode: route.code, analysisResult: result });
    render(<ReportResultClient route={route} />);

    await user.click(screen.getByRole('button', { name: 'tab' }));

    expect(replace).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(calledParams(replace).get('tab')).toBe('comparison');
  });

  it('sends the reader back to the form on reset', async () => {
    const user = userEvent.setup();
    mockHooks({ meta: reportMeta, fetchedCode: route.code, analysisResult: result });
    render(<ReportResultClient route={route} />);

    await user.click(screen.getByRole('button', { name: 'reset' }));

    expect(push).toHaveBeenCalledWith('/report');
  });

  it('pushes on a difficulty change, and drops the boss', async () => {
    const user = userEvent.setup();
    params = new URLSearchParams({ spec: '258', boss: '3307' });
    mockHooks({ meta: reportMeta, fetchedCode: route.code, analysisResult: result });
    render(<ReportResultClient route={route} />);

    await user.click(screen.getByRole('button', { name: 'difficulty' }));

    expect(push).toHaveBeenCalledTimes(1);
    const next = calledParams(push);
    expect(next.get('difficulty')).toBe('5');
    expect(next.get('boss')).toBeNull();
  });

  it('replaces rather than pushes when only the boss changes', async () => {
    const user = userEvent.setup();
    mockHooks({ meta: reportMeta, fetchedCode: route.code, analysisResult: result });
    render(<ReportResultClient route={route} />);

    await user.click(screen.getByRole('button', { name: 'boss' }));

    expect(replace).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(calledParams(replace).get('boss')).toBe('3307');
  });

  it('drops the boss when the actor changes', async () => {
    const user = userEvent.setup();
    params = new URLSearchParams({ spec: '258', boss: '3307' });
    mockHooks({ meta: reportMeta, fetchedCode: route.code, analysisResult: result });
    render(<ReportResultClient route={route} />);

    await user.click(screen.getByRole('button', { name: 'switch' }));

    expect(push).toHaveBeenCalledTimes(1);
    const url = push.mock.calls[0][0] as string;
    expect(url.startsWith('/report/aBcD1234/8')).toBe(true);
    expect(calledParams(push).get('boss')).toBeNull();
  });
});
