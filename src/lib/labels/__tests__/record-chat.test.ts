import type { ChatToolLog } from '@/lib/ai/chat-tools';
import type { BossResult } from '@/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_PROMPT_VERSION } from '@/lib/ai/chat-prompt';
import { chatMonthKey } from '../chat';
import { CORPUS_MONTH_CAP } from '../corpus';
import { recordChat } from '../record-chat';

const { getServerSession, redisAppend, redisLlen, redisIncrBy, redisExpire } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  redisAppend: vi.fn(),
  redisLlen: vi.fn(),
  redisIncrBy: vi.fn(),
  redisExpire: vi.fn(),
}));

vi.mock('next-auth/next', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/redis', () => ({ redisAppend, redisLlen, redisIncrBy, redisExpire }));

const boss = {
  renderId: 'render-9',
  encounterId: 3306,
  difficulty: 5,
  specId: 103,
} as BossResult;

function log(over: Partial<ChatToolLog> = {}): ChatToolLog {
  return {
    tool: 'reselect_cohort',
    axes: [],
    declined: null,
    refused: false,
    wclCalls: 0,
    ...over,
  };
}

const SESSION = { user: { email: 'raider@example.com' } };

function written() {
  return redisAppend.mock.calls.map(([, value]) => JSON.parse(String(value)));
}

describe('chatMonthKey', () => {
  it('opens one list per month, apart from the other corpus flows', () => {
    expect(chatMonthKey('2026-08-24T09:14:22.000Z')).toBe('labels:chat:2026-08');
  });
});

describe('recordChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LABEL_SALT = 'pepper';
    getServerSession.mockResolvedValue(SESSION);
    redisAppend.mockResolvedValue(1);
    redisLlen.mockResolvedValue(0);
    redisIncrBy.mockResolvedValue(1);
    redisExpire.mockResolvedValue(undefined);
  });

  it('writes what the turn asked of the data, into the month list', async () => {
    await recordChat(boss, {
      provider: 'claude',
      model: 'claude-sonnet-5',
      turn: 2,
      logs: [log({ axes: ['tier-pieces', 'kill-time'] })],
    });

    expect(String(redisAppend.mock.calls[0][0])).toMatch(/^labels:chat:\d{4}-\d{2}$/);
    expect(written()[0]).toMatchObject({
      v: 1,
      kind: 'chat',
      renderId: 'render-9',
      encounterId: 3306,
      difficulty: 5,
      specId: 103,
      promptVersion: CHAT_PROMPT_VERSION,
      provider: 'claude',
      model: 'claude-sonnet-5',
      turn: 2,
      tools: ['reselect_cohort'],
      axes: ['tier-pieces', 'kill-time'],
      declined: null,
      refused: false,
      wclCalls: 0,
    });
  });

  it('carries neither the question nor the answer', async () => {
    // Le refus de `report.ts` s'applique ici plus fort qu'ailleurs : une question de joueur
    // est un champ libre qui s'ignore. Rien de ce qui est écrit ne doit pouvoir en contenir.
    await recordChat(boss, {
      provider: 'claude',
      model: null,
      turn: 1,
      logs: [log({ declined: 'defensives', refused: true })],
    });

    const keys = Object.keys(written()[0]).sort();
    expect(keys).toEqual(
      [
        'at',
        'axes',
        'by',
        'declined',
        'difficulty',
        'encounterId',
        'kind',
        'model',
        'promptVersion',
        'provider',
        'refused',
        'renderId',
        'specId',
        'tools',
        'turn',
        'v',
        'wclCalls',
      ].sort()
    );
  });

  it('identifies the account by its salted hash, never by its address', async () => {
    await recordChat(boss, { provider: 'claude', model: null, turn: 1, logs: [log()] });

    expect(written()[0].by).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(written()[0])).not.toContain('raider@example.com');
  });

  it('writes nothing for an anonymous caller', async () => {
    // Échec fermé sur l'identité : un tour qu'on ne peut rattacher à personne n'entre pas.
    getServerSession.mockResolvedValue(null);

    await recordChat(boss, { provider: 'claude', model: null, turn: 1, logs: [log()] });

    expect(redisAppend).not.toHaveBeenCalled();
  });

  it('writes nothing once the month has reached its cap', async () => {
    redisLlen.mockResolvedValue(CORPUS_MONTH_CAP);

    await recordChat(boss, { provider: 'claude', model: null, turn: 1, logs: [log()] });

    expect(redisAppend).not.toHaveBeenCalled();
  });

  it('records a turn the model answered on its own, with no tool at all', async () => {
    await recordChat(boss, { provider: 'claude', model: null, turn: 4, logs: [] });

    expect(written()[0]).toMatchObject({
      tools: [],
      axes: [],
      declined: null,
      refused: false,
      wclCalls: 0,
    });
  });

  it('dedups the axes across the tools of one turn, keeping the tools in order', async () => {
    await recordChat(boss, {
      provider: 'claude',
      model: null,
      turn: 1,
      logs: [
        log({ axes: ['tier-pieces', 'ilvl'] }),
        log({ tool: 'compare_reference' }),
        log({ axes: ['ilvl', 'kill-time'] }),
      ],
    });

    expect(written()[0].axes).toEqual(['tier-pieces', 'ilvl', 'kill-time']);
    expect(written()[0].tools).toEqual(['reselect_cohort', 'compare_reference', 'reselect_cohort']);
  });

  it('keeps the first declined topic and flags the turn as a refusal', async () => {
    await recordChat(boss, {
      provider: 'claude',
      model: null,
      turn: 1,
      logs: [
        log({ tool: 'decline_out_of_scope', declined: 'survival', refused: true }),
        log({ tool: 'decline_out_of_scope', declined: 'interrupts', refused: true }),
      ],
    });

    expect(written()[0]).toMatchObject({ declined: 'survival', refused: true });
  });

  it('sums the requests actually spent, which a refused promotion does not', async () => {
    await recordChat(boss, {
      provider: 'claude',
      model: null,
      turn: 1,
      logs: [
        log({ tool: 'promote_reference', refused: true, wclCalls: 0 }),
        log({ tool: 'promote_reference', wclCalls: 3 }),
      ],
    });

    expect(written()[0]).toMatchObject({ refused: true, wclCalls: 3 });
  });

  it('never throws when the corpus write fails', async () => {
    // Le chat a déjà répondu au joueur : perdre la capture est acceptable, casser le tour non.
    redisAppend.mockRejectedValue(new Error('upstash down'));

    await expect(
      recordChat(boss, { provider: 'claude', model: null, turn: 1, logs: [log()] })
    ).resolves.toBeUndefined();
  });
});
