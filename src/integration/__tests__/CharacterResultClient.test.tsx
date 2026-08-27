import type { AnalysisInput } from '@/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CharacterResultClient } from '@/components/character/CharacterResultClient';
import { useAnalysis } from '@/hooks/useAnalysis';
import { useZones } from '@/hooks/useZones';

/*
 * `CharacterResultClient` ne calcule rien : il lit la route, la donne à
 * `useCharacterRouteSync`, et réécrit l'URL quand le lecteur change de palier, de boss ou de
 * personnage. Les hooks de données sont doublés — ils ont leurs propres tests — mais
 * `useCharacterRouteSync` reste réel : c'est lui qui relie l'URL au démarrage d'une analyse,
 * et ce lien est le sujet.
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

function CharacterDashboardDouble({
  activeBossIdx,
  activeTab,
  onTabChange,
  onReset,
  onSwitchCharacter,
  onDifficultyChange,
  onBossChange,
}: {
  activeBossIdx: number;
  activeTab: string;
  onTabChange: (t: string) => void;
  onReset: () => void;
  onSwitchCharacter?: (n: string, r: string) => void;
  onDifficultyChange: (d: number) => void;
  onBossChange: (i: number) => void;
}) {
  return (
    <div data-testid="char-dashboard" data-boss-idx={activeBossIdx} data-tab={activeTab}>
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
      {onSwitchCharacter && (
        <button type="button" onClick={() => onSwitchCharacter('Altchar', 'hyjal')}>
          switch
        </button>
      )}
    </div>
  );
}

vi.mock('next/navigation', () => ({
  useRouter: routerDouble,
  useSearchParams: searchParamsDouble,
}));
vi.mock('@/hooks/useZones', () => ({ useZones: vi.fn() }));
vi.mock('@/hooks/useAnalysis', () => ({ useAnalysis: vi.fn() }));
vi.mock('@/components/character/CharacterDashboard', () => ({
  CharacterDashboard: CharacterDashboardDouble,
}));

const route = { region: 'EU' as const, realm: 'ysondre', name: 'Jumbaa' };

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

const start = vi.fn();
const reset = vi.fn();
const retryZones = vi.fn();

function mockHooks({
  analysisInput = null,
  zonesLoading = false,
  zonesError = null,
}: {
  analysisInput?: AnalysisInput | null;
  zonesLoading?: boolean;
  zonesError?: string | null;
} = {}) {
  vi.mocked(useZones).mockReturnValue({
    zones: [{ id: 42, name: 'Manaforge Omega', encounters: input.encounters }],
    loading: zonesLoading,
    error: zonesError,
    retry: retryZones,
  });
  vi.mocked(useAnalysis).mockReturnValue({
    bossStates: [],
    currentDifficulty: 5,
    isAnyLoading: false,
    input: analysisInput,
    start,
    switchBossSpec: vi.fn(),
    switchBossFight: vi.fn(),
    changeDifficulty: vi.fn(),
    retryBoss: vi.fn(),
    reset,
  } as unknown as ReturnType<typeof useAnalysis>);
}

/** L'URL que le dernier `push` (ou `replace`) a demandée, en paramètres lisibles. */
function calledParams(fn: typeof push) {
  const url = fn.mock.calls[fn.mock.calls.length - 1][0] as string;
  return new URLSearchParams(url.split('?')[1] ?? '');
}

describe('characterResultClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    params = new URLSearchParams({ spec: '258' });
    mockHooks();
  });

  it('shows the dashboard once the analysis has an input', () => {
    mockHooks({ analysisInput: input });
    render(<CharacterResultClient route={route} />);

    expect(screen.getByTestId('char-dashboard')).toBeInTheDocument();
  });

  it('starts the analysis the route describes, without a form being filled', async () => {
    render(<CharacterResultClient route={route} />);

    await screen.findByText('Loading…');
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        characterName: 'Jumbaa',
        serverSlug: 'ysondre',
        region: 'EU',
        specId: 258,
      }),
      { preferSnapshot: false }
    );
  });

  it('falls back to an error screen on a truncated URL rather than spinning forever', () => {
    params = new URLSearchParams();
    render(<CharacterResultClient route={route} />);

    expect(
      screen.getByText('This link is missing the spec it was analysed for.')
    ).toBeInTheDocument();
  });

  it('shows the zones error with a retry button', async () => {
    const user = userEvent.setup();
    mockHooks({ zonesError: 'Failed to load raids' });
    render(<CharacterResultClient route={route} />);

    expect(screen.getByText('Failed to load raids')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retryZones).toHaveBeenCalledTimes(1);
  });

  it('reads the active boss from the URL, not from a click', () => {
    params = new URLSearchParams({ spec: '258', boss: '3307' });
    mockHooks({ analysisInput: input });
    render(<CharacterResultClient route={route} />);

    expect(screen.getByTestId('char-dashboard')).toHaveAttribute('data-boss-idx', '1');
  });

  it('reads the open tab from the URL, so a link can point at the gap it shows', () => {
    params = new URLSearchParams({ spec: '258', tab: 'comparison' });
    mockHooks({ analysisInput: input });
    render(<CharacterResultClient route={route} />);

    expect(screen.getByTestId('char-dashboard')).toHaveAttribute('data-tab', 'comparison');
  });

  it('replaces rather than pushes when only the tab changes', async () => {
    const user = userEvent.setup();
    mockHooks({ analysisInput: input });
    render(<CharacterResultClient route={route} />);

    await user.click(screen.getByRole('button', { name: 'tab' }));

    expect(replace).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(calledParams(replace).get('tab')).toBe('comparison');
  });

  it('sends the reader back to the form on reset', async () => {
    const user = userEvent.setup();
    mockHooks({ analysisInput: input });
    render(<CharacterResultClient route={route} />);

    await user.click(screen.getByRole('button', { name: 'reset' }));

    expect(push).toHaveBeenCalledWith('/character');
  });

  it('pushes on a difficulty change, and keeps the boss', async () => {
    const user = userEvent.setup();
    params = new URLSearchParams({ spec: '258', boss: '3307' });
    mockHooks({ analysisInput: input });
    render(<CharacterResultClient route={route} />);

    await user.click(screen.getByRole('button', { name: 'difficulty' }));

    expect(push).toHaveBeenCalledTimes(1);
    const next = calledParams(push);
    expect(next.get('difficulty')).toBe('5');
    expect(next.get('boss')).toBe('3307');
  });

  it('replaces rather than pushes when only the boss changes', async () => {
    const user = userEvent.setup();
    mockHooks({ analysisInput: input });
    render(<CharacterResultClient route={route} />);

    await user.click(screen.getByRole('button', { name: 'boss' }));

    expect(replace).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(calledParams(replace).get('boss')).toBe('3307');
  });

  it('keeps the character and drops the boss when the character changes', async () => {
    const user = userEvent.setup();
    params = new URLSearchParams({ spec: '258', boss: '3307' });
    mockHooks({ analysisInput: input });
    render(<CharacterResultClient route={route} />);

    await user.click(screen.getByRole('button', { name: 'switch' }));

    expect(push).toHaveBeenCalledTimes(1);
    const url = push.mock.calls[0][0] as string;
    expect(url.startsWith('/character/eu/hyjal/Altchar')).toBe(true);
    expect(calledParams(push).get('boss')).toBeNull();
  });
});
