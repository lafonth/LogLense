import type { ChatToolContext, ChatToolLog } from '../chat-tools';
import type {
  AIChatChunk,
  AIStreamChunk,
  ChatTurn,
  ToolCapableProvider,
  UsageData,
} from '../provider';
import type { BossResult } from '@/types';
import { describe, expect, it, vi } from 'vitest';
import { MAX_TOOL_ROUNDS, runChatLoop } from '../chat-loop';
import { CHAT_TOOLS } from '../chat-tools';

/**
 * Le seul outil appelé ici est `decline_out_of_scope` : il ne lit rien de l'instantané, ce qui
 * laisse ces cas porter la boucle et elle seule. La resélection et la promotion sont couvertes
 * dans `chat-tools.test.ts`, avec le `BossResult` que leur exécution demande.
 */
const boss = {} as BossResult;

function usage(over: Partial<UsageData> = {}): UsageData {
  return {
    promptTokens: 100,
    completionTokens: 20,
    totalTokens: 120,
    cachedTokens: null,
    cacheWriteTokens: null,
    model: 'claude-sonnet-5',
    contextWindow: 200000,
    ...over,
  };
}

function decline(id: string, topic = 'defensives'): AIChatChunk {
  return { type: 'tool_call', call: { id, name: 'decline_out_of_scope', input: { topic } } };
}

/**
 * Un fournisseur scripté : un tableau de trames par tour, plus le relevé de ce qu'on lui a
 * passé — la boucle mute son propre tableau de tours, donc chaque appel est cloné à la volée.
 */
function scripted(rounds: AIChatChunk[][]) {
  const seen: ChatTurn[][] = [];
  const provider: ToolCapableProvider = {
    stream: () => new ReadableStream<AIStreamChunk>(),
    streamTurn: (turns) => {
      const chunks = rounds[seen.length] ?? [{ type: 'text' as const, content: 'done' }];
      seen.push(JSON.parse(JSON.stringify(turns)) as ChatTurn[]);
      return new ReadableStream<AIChatChunk>({
        start(controller) {
          for (const c of chunks) controller.enqueue(c);
          controller.close();
        },
      });
    },
  };
  return { provider, seen };
}

async function run(rounds: AIChatChunk[][], over: Partial<ChatToolContext> = {}) {
  const { provider, seen } = scripted(rounds);
  const logs: ChatToolLog[] = [];
  const chunks: AIStreamChunk[] = [];

  const reader = runChatLoop({
    provider,
    systemPrompt: 'system',
    history: [{ role: 'user', text: 'why is my dps low' }],
    context: { boss, promoted: [], promote: null, ...over },
    onLog: (log) => logs.push(log),
  }).getReader();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const text = chunks
    .filter((c): c is { type: 'text'; content: string } => c.type === 'text')
    .map((c) => c.content)
    .join('');
  const usages = chunks.filter((c) => c.type === 'usage');

  return { text, usages, logs, seen };
}

describe('runChatLoop', () => {
  it('streams a plain answer and stops when nothing was asked of the tools', async () => {
    const { text, logs, seen } = await run([
      [
        { type: 'text', content: 'Your ' },
        { type: 'text', content: 'rotation is fine.' },
      ],
    ]);

    expect(text).toBe('Your rotation is fine.');
    expect(logs).toEqual([]);
    expect(seen).toHaveLength(1);
  });

  it('declares the four tools on every turn', async () => {
    const { provider } = scripted([[{ type: 'text', content: 'ok' }]]);
    const spy = vi.spyOn(provider, 'streamTurn');

    const reader = runChatLoop({
      provider,
      systemPrompt: 'system',
      history: [{ role: 'user', text: 'hi' }],
      context: { boss, promoted: [], promote: null },
      onLog: () => {},
    }).getReader();
    for (;;) if ((await reader.read()).done) break;

    expect(spy).toHaveBeenCalledWith(expect.anything(), 'system', CHAT_TOOLS);
  });

  it('runs the tool, feeds its result back, and lets the model answer on top of it', async () => {
    const { text, logs, seen } = await run([
      [{ type: 'text', content: 'Let me check. ' }, decline('call-1')],
      [{ type: 'text', content: 'Nothing is measured there.' }],
    ]);

    expect(text).toBe('Let me check. Nothing is measured there.');
    expect(logs).toEqual([
      {
        tool: 'decline_out_of_scope',
        axes: [],
        declined: 'defensives',
        refused: true,
        wclCalls: 0,
      },
    ]);

    // Le second tour repart de l'historique complet : question, tour assistant avec son appel,
    // puis le résultat rattaché à l'identifiant de cet appel.
    expect(seen[1]).toEqual([
      { role: 'user', text: 'why is my dps low' },
      {
        role: 'assistant',
        text: 'Let me check. ',
        toolCalls: [{ id: 'call-1', name: 'decline_out_of_scope', input: { topic: 'defensives' } }],
      },
      {
        role: 'tool',
        results: [
          {
            id: 'call-1',
            name: 'decline_out_of_scope',
            content: expect.stringContaining('defensives'),
          },
        ],
      },
    ]);
  });

  it('answers an unknown tool name instead of leaving its call unanswered', async () => {
    // Un `tool_use` sans `tool_result` fait refuser le tour suivant par l'API : le nom inconnu
    // se rend au modèle comme une erreur d'outil, pas comme un silence.
    const { logs, seen } = await run([
      [{ type: 'tool_call', call: { id: 'call-1', name: 'read_deaths', input: {} } }],
      [{ type: 'text', content: 'ok' }],
    ]);

    expect(logs).toEqual([]);
    const last = seen[1][2];
    expect(last).toMatchObject({ role: 'tool' });
    expect(
      JSON.parse((last as { results: { content: string }[] }).results[0].content)
    ).toMatchObject({ error: 'unknown-tool' });
  });

  it('runs several tool calls of the same round in order', async () => {
    const { logs } = await run([
      [decline('call-1', 'survival'), decline('call-2', 'interrupts')],
      [{ type: 'text', content: 'ok' }],
    ]);

    expect(logs.map((l) => l.declined)).toEqual(['survival', 'interrupts']);
  });

  it('stops on its round budget and says so rather than trailing off', async () => {
    const rounds = Array.from({ length: MAX_TOOL_ROUNDS + 2 }, (_, i) => [decline(`call-${i}`)]);

    const { text, logs, seen } = await run(rounds);

    expect(logs).toHaveLength(MAX_TOOL_ROUNDS);
    expect(seen).toHaveLength(MAX_TOOL_ROUNDS + 1);
    expect(text).toContain('Stopped after four rounds of tool calls');
  });

  it('sums usage over the whole loop and emits it once', async () => {
    const { usages } = await run([
      [
        decline('call-1'),
        { type: 'usage', data: usage({ cachedTokens: 0, cacheWriteTokens: 90 }) },
      ],
      [
        { type: 'text', content: 'ok' },
        {
          type: 'usage',
          data: usage({ promptTokens: 400, cachedTokens: 90, cacheWriteTokens: 0 }),
        },
      ],
    ]);

    expect(usages).toEqual([
      {
        type: 'usage',
        data: usage({
          promptTokens: 500,
          completionTokens: 40,
          totalTokens: 240,
          cachedTokens: 90,
          cacheWriteTokens: 90,
        }),
      },
    ]);
  });

  it('leaves a cache term unmeasured when no round measured it', async () => {
    // Groq ne rend aucun terme de cache. Deux non-mesures cumulees doivent rester non mesurees :
    // un zero se lirait comme un cache mesure qui n'a jamais pris, et fausserait le cout en euros.
    const { usages } = await run([
      [decline('call-1'), { type: 'usage', data: usage() }],
      [
        { type: 'text', content: 'ok' },
        { type: 'usage', data: usage() },
      ],
    ]);

    expect(usages[0]?.data.cachedTokens).toBeNull();
    expect(usages[0]?.data.cacheWriteTokens).toBeNull();
  });

  it('writes a provider failure into the stream instead of cutting the response', async () => {
    // La panne tombe après que la première trame a été lue : c'est la coupure en cours de
    // réponse, pas un échec au premier octet.
    let pulls = 0;
    const provider: ToolCapableProvider = {
      stream: () => new ReadableStream<AIStreamChunk>(),
      streamTurn: () =>
        new ReadableStream<AIChatChunk>({
          pull(controller) {
            pulls += 1;
            if (pulls === 1) controller.enqueue({ type: 'text', content: 'Half a ' });
            else controller.error(new Error('overloaded'));
          },
        }),
    };

    const chunks: AIStreamChunk[] = [];
    const reader = runChatLoop({
      provider,
      systemPrompt: 'system',
      history: [{ role: 'user', text: 'hi' }],
      context: { boss, promoted: [], promote: null },
      onLog: () => {},
    }).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const text = chunks.map((c) => (c.type === 'text' ? c.content : '')).join('');
    expect(text).toBe('Half a \n\n[Error: overloaded]');
  });
});
