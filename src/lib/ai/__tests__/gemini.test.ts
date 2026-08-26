import type { ChatTurn, ToolSpec } from '../provider';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GeminiProvider } from '../gemini';
import { drain, drainChat, sseResponse } from './sse';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GEMINI_MODEL;
});

function part(text: string) {
  return `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n`;
}

describe('gemini provider', () => {
  it('assembles the text even when a chunk is split across packets', async () => {
    const line = part('Hello ');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(sseResponse([line.slice(0, 25), line.slice(25), part('world')]))
    );

    const { text } = await drain(new GeminiProvider('key').stream('p', 's'));

    expect(text).toBe('Hello world');
  });

  // Le défaut que ce test épingle : la fenêtre était indexée sur le modèle demandé alors que
  // le nom rendu était celui servi — la jauge de contexte annonçait la fenêtre d'un autre.
  // La gamme servie aujourd'hui partage une seule fenêtre, donc c'est le nom rendu qui porte
  // l'assertion ; le repli de la table est couvert par le test suivant.
  it('reports the model Gemini served, not the one that was asked for', async () => {
    process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          part('hi'),
          `data: ${JSON.stringify({
            modelVersion: 'gemini-2.5-flash',
            usageMetadata: {
              promptTokenCount: 40,
              candidatesTokenCount: 8,
              totalTokenCount: 48,
              cachedContentTokenCount: 24,
            },
          })}\n`,
        ])
      )
    );

    const { usage } = await drain(new GeminiProvider('key').stream('p', 's'));

    expect(usage?.data).toEqual({
      promptTokens: 40,
      completionTokens: 8,
      totalTokens: 48,
      cachedTokens: 24,
      cacheWriteTokens: null,
      model: 'gemini-2.5-flash',
      contextWindow: 1048576,
    });
  });

  it('falls back to a default window for a model it does not know', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          `data: ${JSON.stringify({
            modelVersion: 'gemini-9.9-experimental',
            usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
          })}\n`,
        ])
      )
    );

    const { usage } = await drain(new GeminiProvider('key').stream('p', 's'));

    expect(usage?.data.contextWindow).toBe(1048576);
    // Sans total annoncé, la somme des deux vaut mieux qu'un zéro.
    expect(usage?.data.totalTokens).toBe(2);
  });

  it('skips a malformed chunk instead of dropping the rest of the stream', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(sseResponse([part('a'), 'data: {not json\n', part('b')]))
    );

    const { text } = await drain(new GeminiProvider('key').stream('p', 's'));

    expect(text).toBe('ab');
  });

  it('surfaces an HTTP error with the first line of the API message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([JSON.stringify({ error: { message: 'API key not valid\nsee the docs' } })], {
          ok: false,
          status: 400,
        })
      )
    );

    const { text } = await drain(new GeminiProvider('bad').stream('p', 's'));

    expect(text).toContain('Gemini API error 400');
    expect(text).toContain('API key not valid');
    expect(text).not.toContain('see the docs');
  });

  it('surfaces a network failure in the stream', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));

    const { text } = await drain(new GeminiProvider('key').stream('p', 's'));

    expect(text).toContain('ECONNRESET');
  });
});

const TOOLS: ToolSpec[] = [
  {
    name: 'reselect_cohort',
    description: 'Rejoue la cohorte',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        maxIlvlGap: { type: 'number', description: 'écart maximal' },
        specs: { type: 'array', items: { type: 'string' } },
      },
      required: ['maxIlvlGap'],
    },
  },
];

function callFrame(name: string, args: unknown) {
  const frame = { candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }] };
  return `data: ${JSON.stringify(frame)}\n`;
}

function stubFetch(packets: string[]) {
  const fetchMock = vi.fn().mockResolvedValue(sseResponse(packets));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const init = fetchMock.mock.calls[0][1] as { body: string };
  return JSON.parse(init.body) as Record<string, unknown>;
}

describe('gemini provider — chat', () => {
  // Le schéma de nos outils est du JSON Schema ; Gemini n'en accepte qu'un sous-ensemble, et un
  // seul champ de trop suffit à faire refuser toute la requête en 400.
  it('strips what Gemini rejects from the tool schema, and uppercases the types', async () => {
    const fetchMock = stubFetch([]);

    await drainChat(new GeminiProvider('key').streamTurn([], 's', TOOLS));

    const tools = sentBody(fetchMock).tools as Array<{
      functionDeclarations: Array<{ name: string; parameters: unknown }>;
    }>;
    expect(tools[0].functionDeclarations[0]).toEqual({
      name: 'reselect_cohort',
      description: 'Rejoue la cohorte',
      parameters: {
        type: 'OBJECT',
        properties: {
          maxIlvlGap: { type: 'NUMBER', description: 'écart maximal' },
          specs: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['maxIlvlGap'],
      },
    });
  });

  // Gemini ne porte pas d'identifiant d'appel : un résultat se rattache par le nom de la
  // fonction, et il repart dans un tour `user`, pas dans un rôle `tool` qui n'existe pas ici.
  it('sends a tool result as a user turn keyed by the function name', async () => {
    const fetchMock = stubFetch([]);
    const turns: ChatTurn[] = [
      { role: 'user', text: 'pourquoi ?' },
      {
        role: 'assistant',
        text: 'Je regarde.',
        toolCalls: [{ id: 'gemini-0', name: 'reselect_cohort', input: { maxIlvlGap: 4 } }],
      },
      {
        role: 'tool',
        results: [{ id: 'gemini-0', name: 'reselect_cohort', content: '{"ok":true}' }],
      },
    ];

    await drainChat(new GeminiProvider('key').streamTurn(turns, 'system prompt', TOOLS));

    const body = sentBody(fetchMock);
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'system prompt' }] });
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: 'pourquoi ?' }] },
      {
        role: 'model',
        parts: [
          { text: 'Je regarde.' },
          { functionCall: { name: 'reselect_cohort', args: { maxIlvlGap: 4 } } },
        ],
      },
      {
        role: 'user',
        parts: [
          { functionResponse: { name: 'reselect_cohort', response: { result: '{"ok":true}' } } },
        ],
      },
    ]);
  });

  // Un tour sans partie est refusé. Le cas existe : une réponse coupée en cours de flux laisse
  // un tour assistant sans texte ni appel, et la requête suivante échouerait tout entière.
  it('fills an empty assistant turn rather than sending a part-less content', async () => {
    const fetchMock = stubFetch([]);
    const turns: ChatTurn[] = [{ role: 'assistant', text: '', toolCalls: [] }];

    await drainChat(new GeminiProvider('key').streamTurn(turns, 's', TOOLS));

    expect(sentBody(fetchMock).contents).toEqual([
      { role: 'model', parts: [{ text: '(no answer)' }] },
    ]);
  });

  // La boucle répond à chaque appel par son identifiant : Gemini n'en fournit pas, il faut donc
  // les synthétiser, et deux appels du même tour ne peuvent pas porter le même.
  it('synthesises an id for each call, since Gemini sends none', async () => {
    stubFetch([
      part('Je regarde. '),
      callFrame('reselect_cohort', { maxIlvlGap: 4 }),
      callFrame('compare_spell', {}),
    ]);

    const { text, calls } = await drainChat(new GeminiProvider('key').streamTurn([], 's', TOOLS));

    expect(text).toBe('Je regarde. ');
    expect(calls).toEqual([
      { id: 'gemini-0', name: 'reselect_cohort', input: { maxIlvlGap: 4 } },
      { id: 'gemini-1', name: 'compare_spell', input: {} },
    ]);
  });

  it('surfaces an HTTP error of a chat turn in the stream', async () => {
    const body = JSON.stringify({ error: { message: 'API key not valid\nsee docs' } });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(sseResponse([body], { ok: false, status: 400 }))
    );

    const { text } = await drainChat(new GeminiProvider('bad').streamTurn([], 's', TOOLS));

    expect(text).toContain('Gemini API error 400');
    expect(text).toContain('API key not valid');
    expect(text).not.toContain('see docs');
  });
});
