import type { BossState } from '@/hooks/useAnalysis';
import type { AnalysisInput, BossResult } from '@/types';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AIReportTab } from '../AIReportTab';

const start = vi.fn();
const reset = vi.fn();
let aiState: { text: string; usage: unknown; loading: boolean; error: string | null };

function aiReportDouble() {
  return { ...aiState, start, reset };
}

vi.mock('@/hooks/useAIReport', () => ({ useAIReport: aiReportDouble }));

function bossResult(over: Partial<BossResult> = {}): BossResult {
  return {
    renderId: 'render-1',
    encounter: 'Chimaerus',
    encounterId: 3306,
    specId: 258,
    difficulty: 5,
    fightTargets: [],
    character: {
      stats: {
        name: 'Jumbaa',
        avgIlvl: 635,
        primaryStat: 13200,
        crit: 3890,
        haste: 3500,
        mastery: 5800,
        vers: 750,
        talents: {},
      },
      rotation: {
        name: 'Jumbaa',
        dps: 250000,
        fightDurationMs: 180000,
        casts: {},
        buffs: {},
        opening: [],
      },
      damageTable: { entries: [] },
      dps: 250000,
      bossDps: null,
      killTime: '3:00',
      overallPct: 95.5,
      overallPctOf: 1000,
      todayPct: 92.1,
      bossDpsPct: null,
      bracket: 0,
      source: { code: 'abc', fightID: 17, actorId: 63 },
      trajectory: [],
      eligibility: { tierPieces: 4, externalUptime: 0, externals: [] },
      context: null,
    },
    topPlayers: [],
    sample: [],
    comparability: {
      level: 'close',
      referenceIlvl: 636,
      myIlvl: 635,
      referenceKillTimeMs: 178000,
      myKillTimeMs: 180000,
      candidatesConsidered: 500,
      pagesFetched: 5,
      disqualified: 0,
      unverifiable: 0,
      substituted: 0,
    },
    ...over,
  };
}

const input: AnalysisInput = {
  characterName: 'Jumbaa',
  serverSlug: 'ysondre',
  region: 'EU',
  difficulty: 4,
  encounters: [{ id: 3306, name: 'Chimaerus' }],
  specId: 258,
};

function ok(boss: BossResult): BossState {
  return { status: 'success', result: boss };
}

/** `/api/ai-report` annonce les fournisseurs dont la clé est déjà posée côté serveur. */
function mockConfiguredProviders(providers: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ configuredProviders: providers }),
    } as Response)
  );
}

// L'environnement DOM des tests n'expose pas `localStorage` : sans ce double, l'onglet
// échouerait sur l'absence du stockage plutôt que sur ce qu'on cherche à vérifier.
function fakeStorage() {
  const entries = new Map<string, string>();
  return {
    getItem: (k: string) => entries.get(k) ?? null,
    setItem: (k: string, v: string) => void entries.set(k, v),
    removeItem: (k: string) => void entries.delete(k),
    clear: () => entries.clear(),
  };
}

let storage: ReturnType<typeof fakeStorage>;

function renderTab(over: Partial<Parameters<typeof AIReportTab>[0]> = {}) {
  return render(
    <AIReportTab bossStates={[ok(bossResult())]} input={input} activeBossResult={null} {...over} />
  );
}

describe('aIReportTab', () => {
  beforeEach(() => {
    aiState = { text: '', usage: null, loading: false, error: null };
    start.mockClear();
    reset.mockClear();
    storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    mockConfiguredProviders([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refuses to spend a call while no key is available anywhere', async () => {
    renderTab();

    const analyse = await screen.findByRole('button', { name: 'Analyse' });
    expect(analyse).toBeDisabled();
  });

  it('takes the server key as sufficient, and stops asking for one', async () => {
    mockConfiguredProviders(['groq']);
    renderTab();

    await waitFor(() => expect(screen.getByText(/configured on server/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Analyse' })).toBeEnabled();
    expect(screen.queryByLabelText(/Groq API Key/i)).not.toBeInTheDocument();
  });

  it('unlocks the analysis once a key is typed', async () => {
    const user = userEvent.setup();
    renderTab();

    await user.type(await screen.findByLabelText(/Groq API Key/i), 'gsk_secret');

    expect(screen.getByRole('button', { name: 'Analyse' })).toBeEnabled();
  });

  it('does not treat blank space as a key', async () => {
    const user = userEvent.setup();
    renderTab();

    await user.type(await screen.findByLabelText(/Groq API Key/i), '   ');

    expect(screen.getByRole('button', { name: 'Analyse' })).toBeDisabled();
  });

  it('sends only the selected boss, and the trimmed key', async () => {
    const user = userEvent.setup();
    renderTab();

    await user.type(await screen.findByLabelText(/Groq API Key/i), '  gsk_secret  ');
    await user.click(screen.getByRole('button', { name: 'Analyse' }));

    expect(start).toHaveBeenCalledTimes(1);
    const [payload, key, provider] = start.mock.calls[0];
    expect(payload.bosses).toHaveLength(1);
    expect(payload.bosses[0].encounterId).toBe(3306);
    expect(payload.input).toEqual(input);
    expect(key).toBe('gsk_secret');
    expect(provider).toBe('groq');
  });

  it('passes a model only for the provider that has one', async () => {
    const user = userEvent.setup();
    renderTab();

    await user.type(await screen.findByLabelText(/Groq API Key/i), 'gsk_secret');
    await user.click(screen.getByRole('button', { name: 'Analyse' }));
    expect(start.mock.calls[0][3]).toBeDefined();

    start.mockClear();
    await user.selectOptions(screen.getByLabelText('Provider'), 'claude');
    await user.type(await screen.findByLabelText(/Anthropic API Key/i), 'sk-ant-secret');
    await user.click(screen.getByRole('button', { name: 'Analyse' }));

    expect(start.mock.calls[0][2]).toBe('claude');
    expect(start.mock.calls[0][3]).toBeUndefined();
  });

  it('keeps each provider key apart rather than reusing one field', async () => {
    const user = userEvent.setup();
    renderTab();

    await user.type(await screen.findByLabelText(/Groq API Key/i), 'gsk_secret');
    await user.selectOptions(screen.getByLabelText('Provider'), 'claude');

    expect(await screen.findByLabelText(/Anthropic API Key/i)).toHaveValue('');
  });

  it('selects the sidebar boss before the first render, not after', async () => {
    const other = bossResult({ encounterId: 3307, encounter: 'Fractillus', renderId: 'render-2' });
    renderTab({
      bossStates: [ok(bossResult()), ok(other)],
      activeBossResult: other,
    });

    // Le sélecteur doit déjà porter Fractillus : un effet aurait rendu Chimaerus d'abord.
    expect(screen.getByLabelText('Boss')).toHaveValue('1');
  });

  it('lets the reader override the sidebar boss, and sends that one', async () => {
    const user = userEvent.setup();
    const other = bossResult({ encounterId: 3307, encounter: 'Fractillus', renderId: 'render-2' });
    renderTab({ bossStates: [ok(bossResult()), ok(other)], activeBossResult: other });

    await user.selectOptions(screen.getByLabelText('Boss'), '0');
    await user.type(await screen.findByLabelText(/Groq API Key/i), 'gsk_secret');
    await user.click(screen.getByRole('button', { name: 'Analyse' }));

    expect(start.mock.calls[0][0].bosses[0].encounterId).toBe(3306);
  });

  it('drops the previous report when the boss changes', async () => {
    const user = userEvent.setup();
    renderTab({ bossStates: [ok(bossResult()), ok(bossResult({ encounterId: 3307 }))] });

    await user.selectOptions(screen.getByLabelText('Boss'), '1');

    expect(reset).toHaveBeenCalled();
  });

  it('hides the boss selector when there is nothing to choose between', () => {
    renderTab();

    expect(screen.queryByLabelText('Boss')).not.toBeInTheDocument();
  });

  it('skips the bosses that produced no result', () => {
    renderTab({
      bossStates: [
        ok(bossResult()),
        { status: 'error', message: 'no ranked kill' },
        ok(bossResult({ encounterId: 3307, encounter: 'Fractillus' })),
      ],
    });

    expect(screen.getAllByRole('option', { name: /Chimaerus|Fractillus/ })).toHaveLength(2);
  });

  it('withholds the feedback prompt while the text is still streaming', () => {
    aiState = { text: 'Partial adv', usage: null, loading: true, error: null };
    renderTab();

    expect(screen.queryByText(/Did this help/i)).not.toBeInTheDocument();
  });

  it('asks for feedback once the stream has ended', () => {
    aiState = { text: 'Full advice', usage: null, loading: false, error: null };
    renderTab();

    expect(screen.getByText(/Did this help/i)).toBeInTheDocument();
  });

  it('asks nothing when no report was produced', () => {
    renderTab();

    expect(screen.queryByText(/Did this help/i)).not.toBeInTheDocument();
  });

  it('shows the provider error instead of a report', () => {
    aiState = { text: '', usage: null, loading: false, error: 'Rate limit reached' };
    renderTab();

    expect(screen.getByText(/Rate limit reached/)).toBeInTheDocument();
  });

  it('swaps Analyse for Reset once a report exists', () => {
    aiState = { text: 'Full advice', usage: null, loading: false, error: null };
    renderTab();

    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Analyse' })).not.toBeInTheDocument();
  });

  it('remembers the groq model across sessions', async () => {
    const user = userEvent.setup();
    renderTab();

    const radios = screen.getAllByRole('radio');
    await user.click(radios[radios.length - 1]);

    expect(storage.getItem('loglense_groq_model')).toBeTruthy();
    expect(reset).toHaveBeenCalled();
  });

  it('survives a server that will not say which providers it holds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    renderTab();

    expect(await screen.findByLabelText(/Groq API Key/i)).toBeInTheDocument();
  });
});
