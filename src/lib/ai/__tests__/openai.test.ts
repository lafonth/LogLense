import type { ChatTurn, ToolSpec } from '../provider';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { OpenAIProvider } from '../openai';
import { drain, drainChat, sseResponse } from './sse';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENAI_MODEL;
});

/** Une trame de texte, telle que l'API l'émet. */
function part(content: string) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

/** Une trame d'appel d'outil : `index` est le seul champ commun à tous les fragments d'un appel. */
function callPart(index: number, fields: { id?: string; name?: string; args?: string }) {
  const delta = {
    tool_calls: [
      {
        index,
        ...(fields.id ? { id: fields.id } : {}),
        function: {
          ...(fields.name ? { name: fields.name } : {}),
          ...(fields.args ? { arguments: fields.args } : {}),
        },
      },
    ],
  };
  return `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`;
}

function usagePart(model: string) {
  const frame = {
    model,
    choices: [],
    usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
  };
  return `data: ${JSON.stringify(frame)}\n\n`;
}

const DONE = 'data: [DONE]\n\n';

const TOOLS: ToolSpec[] = [
  {
    name: 'reselect_cohort',
    description: 'Rejoue la cohorte',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { maxIlvlGap: { type: 'number' } },
    },
  },
];

function stubFetch(packets: string[], init?: { ok?: boolean; status?: number }) {
  const fetchMock = vi.fn().mockResolvedValue(sseResponse(packets, init));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Le corps JSON de la requête sortante, tel que le fournisseur l'a construit. */
function sentBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const init = fetchMock.mock.calls[0][1] as { body: string };
  return JSON.parse(init.body) as Record<string, unknown>;
}

describe('openai provider — rapport', () => {
  it('assembles the text even when a frame is split across packets', async () => {
    const line = part('Hello ');
    stubFetch([line.slice(0, 20), line.slice(20), part('world'), DONE]);

    const { text } = await drain(new OpenAIProvider('key').stream('p', 's'));

    expect(text).toBe('Hello world');
  });

  it('reports the model OpenAI served, not the one that was asked for', async () => {
    process.env.OPENAI_MODEL = 'gpt-5.1';
    stubFetch([part('hi'), usagePart('gpt-4o-mini'), DONE]);

    const { usage } = await drain(new OpenAIProvider('key').stream('p', 's'));

    expect(usage?.data).toEqual({
      promptTokens: 120,
      completionTokens: 30,
      totalTokens: 150,
      model: 'gpt-4o-mini',
      contextWindow: 128000,
    });
  });

  // Le nom rendu porte une date que la table ne contient pas : sans repli sur le préfixe, la
  // jauge de contexte annoncerait 128 k pour un modèle qui en tient 400 k.
  it('falls back on the model prefix for a dated model name', async () => {
    stubFetch([usagePart('gpt-5.1-2026-04-01'), DONE]);

    const { usage } = await drain(new OpenAIProvider('key').stream('p', 's'));

    expect(usage?.data.contextWindow).toBe(400000);
  });

  it('falls back to a default window for a model it does not know', async () => {
    stubFetch([usagePart('o9-preview'), DONE]);

    const { usage } = await drain(new OpenAIProvider('key').stream('p', 's'));

    expect(usage?.data.contextWindow).toBe(128000);
  });

  it('stops on the [DONE] sentinel rather than reading what follows it', async () => {
    stubFetch([part('a'), DONE, part('b')]);

    const { text } = await drain(new OpenAIProvider('key').stream('p', 's'));

    expect(text).toBe('a');
  });

  it('surfaces an HTTP error with the first line of the API message', async () => {
    const body = JSON.stringify({ error: { message: 'Incorrect API key\ndocs here' } });
    stubFetch([body], { ok: false, status: 401 });

    const { text } = await drain(new OpenAIProvider('bad').stream('p', 's'));

    expect(text).toContain('OpenAI API error 401');
    expect(text).toContain('Incorrect API key');
    expect(text).not.toContain('docs here');
  });

  it('surfaces a network failure in the stream', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));

    const { text } = await drain(new OpenAIProvider('key').stream('p', 's'));

    expect(text).toContain('ECONNRESET');
  });
});

describe('openai provider — chat', () => {
  // Les arguments arrivent en fragments de JSON, et un objet à moitié écrit n'est pas exécutable :
  // c'est la raison pour laquelle les appels sont émis à la fin du flux et non au fil de l'eau.
  it('reassembles a tool call whose arguments arrive in fragments', async () => {
    stubFetch([
      callPart(0, { id: 'call_a', name: 'reselect_cohort' }),
      callPart(0, { args: '{"maxIlvl' }),
      callPart(0, { args: 'Gap": 4}' }),
      DONE,
    ]);

    const { calls } = await drainChat(new OpenAIProvider('key').streamTurn([], 's', TOOLS));

    expect(calls).toEqual([{ id: 'call_a', name: 'reselect_cohort', input: { maxIlvlGap: 4 } }]);
  });

  // Deux appels dans le même tour s'entrelacent : concaténer leurs fragments à la file produirait
  // deux JSON invalides.
  it('keeps two interleaved calls apart, by index', async () => {
    stubFetch([
      callPart(0, { id: 'call_a', name: 'reselect_cohort', args: '{"a"' }),
      callPart(1, { id: 'call_b', name: 'compare_spell', args: '{"b"' }),
      callPart(0, { args: ':1}' }),
      callPart(1, { args: ':2}' }),
      DONE,
    ]);

    const { calls } = await drainChat(new OpenAIProvider('key').streamTurn([], 's', TOOLS));

    expect(calls).toEqual([
      { id: 'call_a', name: 'reselect_cohort', input: { a: 1 } },
      { id: 'call_b', name: 'compare_spell', input: { b: 2 } },
    ]);
  });

  // Perdre l'appel serait pire que le passer vide : la boucle répond à chaque `tool_call`, et un
  // appel resté sans réponse fait échouer la requête suivante.
  it('still emits a call whose arguments do not parse', async () => {
    stubFetch([callPart(0, { id: 'call_a', name: 'reselect_cohort', args: '{not json' }), DONE]);

    const { calls } = await drainChat(new OpenAIProvider('key').streamTurn([], 's', TOOLS));

    expect(calls).toEqual([{ id: 'call_a', name: 'reselect_cohort', input: {} }]);
  });

  it('streams the text of a turn that also asks for a tool', async () => {
    stubFetch([
      part('Je regarde. '),
      callPart(0, { id: 'call_a', name: 'reselect_cohort', args: '{}' }),
      usagePart('gpt-5.1'),
      DONE,
    ]);

    const { text, calls, usage } = await drainChat(
      new OpenAIProvider('key').streamTurn([], 's', TOOLS)
    );

    expect(text).toBe('Je regarde. ');
    expect(calls).toHaveLength(1);
    expect(usage?.data.totalTokens).toBe(150);
  });
});

describe('openai provider — la requête sortante', () => {
  // Là où Anthropic groupe tous les résultats d'un tour dans un seul message, OpenAI en veut un
  // par appel, rattaché par `tool_call_id` : un appel resté sans réponse fait échouer la requête.
  it('sends one tool message per result, and a null content for a call-only turn', async () => {
    const fetchMock = stubFetch([DONE]);
    const turns: ChatTurn[] = [
      { role: 'user', text: 'pourquoi ?' },
      {
        role: 'assistant',
        text: '',
        toolCalls: [
          { id: 'call_a', name: 'reselect_cohort', input: { maxIlvlGap: 4 } },
          { id: 'call_b', name: 'compare_spell', input: {} },
        ],
      },
      {
        role: 'tool',
        results: [
          { id: 'call_a', name: 'reselect_cohort', content: '{"ok":true}' },
          { id: 'call_b', name: 'compare_spell', content: '{"ok":false}' },
        ],
      },
    ];

    await drainChat(new OpenAIProvider('key').streamTurn(turns, 'system prompt', TOOLS));

    expect(sentBody(fetchMock).messages).toEqual([
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'pourquoi ?' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_a',
            type: 'function',
            function: { name: 'reselect_cohort', arguments: '{"maxIlvlGap":4}' },
          },
          { id: 'call_b', type: 'function', function: { name: 'compare_spell', arguments: '{}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'call_a', content: '{"ok":true}' },
      { role: 'tool', tool_call_id: 'call_b', content: '{"ok":false}' },
    ]);
  });

  // `max_tokens` ne comptait pas les jetons de raisonnement : les modèles récents le refusent.
  it('declares its tools and bounds the answer with max_completion_tokens', async () => {
    const fetchMock = stubFetch([DONE]);

    await drainChat(new OpenAIProvider('key').streamTurn([], 's', TOOLS));

    const body = sentBody(fetchMock);
    expect(body.max_completion_tokens).toBe(1200);
    expect(body.max_tokens).toBeUndefined();
    expect(body.stream_options).toEqual({ include_usage: true });
    expect(body.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'reselect_cohort',
          description: 'Rejoue la cohorte',
          parameters: TOOLS[0].inputSchema,
        },
      },
    ]);
  });
});
