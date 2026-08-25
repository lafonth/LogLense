import type {
  AIChatChunk,
  AIProvider,
  AIStreamChunk,
  ChatTurn,
  ToolCapableProvider,
  ToolSpec,
} from './provider';

interface GeminiPart {
  text?: string;
  functionCall?: { name?: string; args?: unknown };
}

interface GeminiChunk {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  modelVersion?: string;
}

interface GeminiErrorBody {
  error?: { message?: string; status?: string };
}

const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
// Toute la gamme servie aujourd'hui partage la même fenêtre, donc la table vaut le défaut
// partout : elle reste la couture par laquelle un modèle à fenêtre différente s'ajoute.
const GEMINI_CONTEXT_WINDOWS: Record<string, number> = {
  'gemini-3.5-flash-lite': 1048576,
  'gemini-3.5-flash': 1048576,
  'gemini-2.5-flash-lite': 1048576,
  'gemini-2.5-flash': 1048576,
};

const DEFAULT_CONTEXT_WINDOW = 1048576;

/**
 * Fenêtre de sortie d'un tour de chat. Même valeur que chez Claude, pour la même raison : une
 * réponse de chat répond à une question, elle ne rejoue pas l'analyse entière.
 */
const CHAT_MAX_TOKENS = 1200;

function geminiModel(): string {
  return process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
}

function geminiUrl(model: string, apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
}

function extractGeminiError(body: string): string {
  try {
    const parsed = JSON.parse(body) as GeminiErrorBody;
    return parsed.error?.message?.split('\n')[0] ?? body;
  } catch {
    return body;
  }
}

/**
 * Les seules clés de schéma que Gemini accepte.
 *
 * La liste est une allow-list et non une deny-list parce que le refus est fatal : Gemini rejette
 * la requête entière sur une clé inconnue, et `additionalProperties`, que déclarent nos quatre
 * outils, suffit à faire un 400. Filtrer par ce qu'on garde met ce risque hors de portée d'un
 * schéma d'outil qu'on enrichirait plus tard.
 */
const GEMINI_SCHEMA_KEYS = [
  'type',
  'description',
  'enum',
  'format',
  'nullable',
  'items',
  'properties',
  'required',
];

/** JSON Schema d'outil → le sous-ensemble OpenAPI que Gemini sait lire. */
function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (typeof schema !== 'object' || schema === null) return schema;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (!GEMINI_SCHEMA_KEYS.includes(key)) continue;

    if (key === 'type' && typeof value === 'string') {
      // `type` est une énumération proto, pas une chaîne libre : `STRING` passe là où `string`
      // est refusé, et le JSON Schema de nos outils est écrit en minuscules.
      out[key] = value.toUpperCase();
    } else if (key === 'properties' && typeof value === 'object' && value !== null) {
      const props: Record<string, unknown> = {};
      for (const [name, sub] of Object.entries(value as Record<string, unknown>)) {
        props[name] = toGeminiSchema(sub);
      }
      out[key] = props;
    } else if (key === 'items') {
      out[key] = toGeminiSchema(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * L'historique de la boucle → le tableau `contents` de Gemini.
 *
 * Gemini ne connaît que deux rôles, `user` et `model` : un résultat d'outil part donc dans un
 * tour `user`, comme chez Anthropic. Il ne connaît pas non plus d'identifiant d'appel — le
 * rattachement se fait par nom de fonction, ce que porte `ToolResult.name`.
 */
function toContents(turns: ChatTurn[]): unknown[] {
  return turns.map((turn) => {
    if (turn.role === 'user') return { role: 'user', parts: [{ text: turn.text }] };

    if (turn.role === 'tool') {
      return {
        role: 'user',
        // `response` doit être un objet : le contenu d'un outil est du texte, il s'enveloppe
        // plutôt que de se reparser — un outil qui rendrait autre chose que du JSON ferait
        // échouer la requête au lieu de faire répondre le modèle.
        parts: turn.results.map((r) => ({
          functionResponse: { name: r.name, response: { result: r.content } },
        })),
      };
    }

    const parts: GeminiPart[] = [];
    if (turn.text) parts.push({ text: turn.text });
    for (const call of turn.toolCalls) {
      parts.push({ functionCall: { name: call.name, args: call.input ?? {} } });
    }
    // Un tour sans partie est refusé. Le cas existe : une réponse coupée en cours de flux laisse
    // un tour assistant sans texte ni appel.
    if (parts.length === 0) parts.push({ text: '(no answer)' });
    return { role: 'model', parts };
  });
}

/**
 * Lit un flux SSE Gemini et rend chaque trame décodée.
 *
 * Le tampon de ligne est la raison d'être de la fonction : une trame n'a aucune raison de tomber
 * sur une frontière de chunk, et la moitié perdue le serait en silence.
 */
async function forEachFrame(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onFrame: (chunk: GeminiChunk) => void
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';

  const handle = (line: string) => {
    if (!line.startsWith('data: ')) return;
    const json = line.slice(6).trim();
    if (!json) return;
    try {
      onFrame(JSON.parse(json) as GeminiChunk);
    } catch {
      // malformed chunk — skip
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) handle(line);
  }

  buffer += decoder.decode();
  if (buffer) handle(buffer);
}

export class GeminiProvider implements AIProvider, ToolCapableProvider {
  constructor(private apiKey: string) {}

  stream(prompt: string, systemPrompt: string): ReadableStream<AIStreamChunk> {
    const apiKey = this.apiKey;

    return new ReadableStream<AIStreamChunk>({
      async start(controller) {
        const model = geminiModel();

        let res: Response;
        try {
          res = await fetch(geminiUrl(model, apiKey), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 1500 },
            }),
          });
        } catch (e) {
          controller.enqueue({
            type: 'text',
            content: `\n\n[Error: ${e instanceof Error ? e.message : 'Network error'}]`,
          });
          controller.close();
          return;
        }

        if (!res.ok) {
          const body = await res.text();
          controller.enqueue({
            type: 'text',
            content: `\n\n[Gemini API error ${res.status}: ${extractGeminiError(body)}]`,
          });
          controller.close();
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        let lastUsage: GeminiChunk['usageMetadata'] | undefined;
        let resolvedModel = model;

        await forEachFrame(reader, (chunk) => {
          const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) controller.enqueue({ type: 'text', content: text });
          if (chunk.usageMetadata) lastUsage = chunk.usageMetadata;
          if (chunk.modelVersion) resolvedModel = chunk.modelVersion;
        });

        if (lastUsage) {
          const promptTokens = lastUsage.promptTokenCount ?? 0;
          const completionTokens = lastUsage.candidatesTokenCount ?? 0;
          controller.enqueue({
            type: 'usage',
            data: {
              promptTokens,
              completionTokens,
              totalTokens: lastUsage.totalTokenCount ?? promptTokens + completionTokens,
              model: resolvedModel,
              // Indexé sur le modèle que Gemini dit avoir servi, pas sur celui demandé :
              // annoncer un modèle avec la fenêtre d'un autre fausse la jauge de contexte.
              contextWindow: GEMINI_CONTEXT_WINDOWS[resolvedModel] ?? DEFAULT_CONTEXT_WINDOW,
            },
          });
        }

        controller.close();
      },
    });
  }

  /**
   * Un tour de la boucle de chat : le modèle répond, ou demande des outils.
   *
   * Les appels d'outil arrivent complets dans leur trame — il n'y a pas de JSON partiel à
   * recoller comme chez OpenAI, un `functionCall` se réémet tel quel.
   *
   * Les identifiants sont fabriqués ici parce que Gemini n'en émet pas. Ils ne servent qu'à la
   * boucle, qui les recopie sur les résultats ; côté API le rattachement se fait par nom.
   */
  streamTurn(
    turns: ChatTurn[],
    systemPrompt: string,
    tools: ToolSpec[]
  ): ReadableStream<AIChatChunk> {
    const apiKey = this.apiKey;

    return new ReadableStream<AIChatChunk>({
      async start(controller) {
        const model = geminiModel();

        let res: Response;
        try {
          res = await fetch(geminiUrl(model, apiKey), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: toContents(turns),
              tools: [
                {
                  functionDeclarations: tools.map((t) => ({
                    name: t.name,
                    description: t.description,
                    parameters: toGeminiSchema(t.inputSchema),
                  })),
                },
              ],
              generationConfig: { maxOutputTokens: CHAT_MAX_TOKENS },
            }),
          });
        } catch (e) {
          controller.enqueue({
            type: 'text',
            content: `\n\n[Error: ${e instanceof Error ? e.message : 'Network error'}]`,
          });
          controller.close();
          return;
        }

        if (!res.ok) {
          const body = await res.text();
          controller.enqueue({
            type: 'text',
            content: `\n\n[Gemini API error ${res.status}: ${extractGeminiError(body)}]`,
          });
          controller.close();
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        let lastUsage: GeminiChunk['usageMetadata'] | undefined;
        let resolvedModel = model;
        let callCount = 0;

        await forEachFrame(reader, (chunk) => {
          for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
            if (part.text) controller.enqueue({ type: 'text', content: part.text });
            if (part.functionCall?.name) {
              controller.enqueue({
                type: 'tool_call',
                call: {
                  id: `gemini-${callCount++}`,
                  name: part.functionCall.name,
                  input: part.functionCall.args ?? {},
                },
              });
            }
          }
          if (chunk.usageMetadata) lastUsage = chunk.usageMetadata;
          if (chunk.modelVersion) resolvedModel = chunk.modelVersion;
        });

        if (lastUsage) {
          const promptTokens = lastUsage.promptTokenCount ?? 0;
          const completionTokens = lastUsage.candidatesTokenCount ?? 0;
          controller.enqueue({
            type: 'usage',
            data: {
              promptTokens,
              completionTokens,
              totalTokens: lastUsage.totalTokenCount ?? promptTokens + completionTokens,
              model: resolvedModel,
              contextWindow: GEMINI_CONTEXT_WINDOWS[resolvedModel] ?? DEFAULT_CONTEXT_WINDOW,
            },
          });
        }

        controller.close();
      },
    });
  }
}
