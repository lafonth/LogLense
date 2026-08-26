import type {
  AIChatChunk,
  AIProvider,
  AIStreamChunk,
  ChatTurn,
  ToolCall,
  ToolCapableProvider,
  ToolSpec,
} from './provider';

/**
 * Un appel d'outil arrive en morceaux : l'identifiant et le nom dans la première trame, les
 * arguments en fragments de JSON dans les suivantes. Le tampon les recolle par `index`, seul
 * champ commun à toutes les trames d'un même appel.
 */
interface ToolCallDelta {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface OpenAIChunk {
  choices?: Array<{
    delta?: { content?: string; tool_calls?: ToolCallDelta[] };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    /**
     * Part de `prompt_tokens` servie depuis le cache — le cache d'OpenAI est automatique, il
     * ne se demande pas. Le champ manque quand le modèle ne cache pas, d'où le `null` en aval.
     */
    prompt_tokens_details?: { cached_tokens?: number };
  };
  model?: string;
}

interface OpenAIErrorBody {
  error?: { message?: string; type?: string };
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const DEFAULT_OPENAI_MODEL = 'gpt-5.1';
const OPENAI_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-5.1': 400000,
  'gpt-5': 400000,
  'gpt-5-mini': 400000,
  'gpt-4.1': 1047576,
  'gpt-4.1-mini': 1047576,
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
};

const DEFAULT_CONTEXT_WINDOW = 128000;

/** Même borne que chez Claude et Gemini : un tour de chat répond, il ne rejoue pas l'analyse. */
const CHAT_MAX_TOKENS = 1200;

function openaiModel(): string {
  return process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
}

/**
 * La fenêtre du modèle réellement servi. Le nom rendu porte souvent un suffixe de date
 * (`gpt-5.1-2026-04-01`) : on retombe donc sur le préfixe avant d'abandonner sur le défaut.
 */
function contextWindowForModel(model: string): number {
  if (OPENAI_CONTEXT_WINDOWS[model]) return OPENAI_CONTEXT_WINDOWS[model];
  const known = Object.keys(OPENAI_CONTEXT_WINDOWS).find((id) => model.startsWith(id));
  return known ? OPENAI_CONTEXT_WINDOWS[known] : DEFAULT_CONTEXT_WINDOW;
}

function extractOpenAIError(body: string): string {
  try {
    const parsed = JSON.parse(body) as OpenAIErrorBody;
    return parsed.error?.message?.split('\n')[0] ?? body;
  } catch {
    return body;
  }
}

/**
 * L'historique de la boucle → les `messages` d'OpenAI.
 *
 * Un résultat d'outil est un message à lui seul, rattaché par `tool_call_id` : là où Anthropic
 * groupe tous les résultats d'un tour dans un seul message, OpenAI en veut un par appel, et un
 * appel resté sans réponse fait échouer la requête suivante.
 */
function toMessages(turns: ChatTurn[], systemPrompt: string): unknown[] {
  const messages: unknown[] = [{ role: 'system', content: systemPrompt }];

  for (const turn of turns) {
    if (turn.role === 'user') {
      messages.push({ role: 'user', content: turn.text });
    } else if (turn.role === 'tool') {
      for (const r of turn.results) {
        messages.push({ role: 'tool', tool_call_id: r.id, content: r.content });
      }
    } else {
      messages.push({
        // `content` vaut `null` et non `''` quand le tour n'est qu'un appel d'outil : une chaîne
        // vide est un contenu, et certains modèles la relisent comme une réponse déjà donnée.
        role: 'assistant',
        content: turn.text || null,
        ...(turn.toolCalls.length > 0
          ? {
              tool_calls: turn.toolCalls.map((c) => ({
                id: c.id,
                type: 'function',
                function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) },
              })),
            }
          : {}),
      });
    }
  }

  return messages;
}

/**
 * Lit un flux SSE OpenAI et rend chaque trame décodée. La sentinelle `[DONE]` arrête la lecture.
 *
 * Le tampon de ligne est la raison d'être de la fonction : une trame n'a aucune raison de tomber
 * sur une frontière de chunk, et la moitié perdue le serait en silence.
 */
async function forEachFrame(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onFrame: (chunk: OpenAIChunk) => void
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';
  let done = false;

  const handle = (line: string) => {
    if (done || !line.startsWith('data: ')) return;
    const json = line.slice(6).trim();
    if (!json) return;
    if (json === '[DONE]') {
      done = true;
      return;
    }
    try {
      onFrame(JSON.parse(json) as OpenAIChunk);
    } catch {
      // malformed chunk — skip
    }
  };

  while (true) {
    const { value, done: finished } = await reader.read();
    if (finished) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) handle(line);
    // Après le lot en cours, pas au milieu : les lignes déjà découpées sont traitées, et
    // `handle` ignore de lui-même celles qui suivent la sentinelle.
    if (done) break;
  }

  buffer += decoder.decode();
  if (buffer) handle(buffer);
}

export class OpenAIProvider implements AIProvider, ToolCapableProvider {
  constructor(private apiKey: string) {}

  stream(prompt: string, systemPrompt: string): ReadableStream<AIStreamChunk> {
    const apiKey = this.apiKey;

    return new ReadableStream<AIStreamChunk>({
      async start(controller) {
        const model = openaiModel();

        let res: Response;
        try {
          res = await fetch(OPENAI_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              // `max_completion_tokens` et non `max_tokens` : les modèles récents refusent le
              // second, qui ne comptait pas les jetons de raisonnement.
              max_completion_tokens: 1500,
              stream: true,
              stream_options: { include_usage: true },
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt },
              ],
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
            content: `\n\n[OpenAI API error ${res.status}: ${extractOpenAIError(body)}]`,
          });
          controller.close();
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        let usageChunk: OpenAIChunk['usage'] | null = null;
        let resolvedModel: string = model;

        await forEachFrame(reader, (chunk) => {
          const text = chunk.choices?.[0]?.delta?.content;
          if (text) controller.enqueue({ type: 'text', content: text });
          if (chunk.usage) usageChunk = chunk.usage;
          if (chunk.model) resolvedModel = chunk.model;
        });

        if (usageChunk) {
          const usage: NonNullable<OpenAIChunk['usage']> = usageChunk;
          controller.enqueue({
            type: 'usage',
            data: {
              promptTokens: usage.prompt_tokens,
              completionTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
              cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? null,
              // OpenAI ne facture pas l'écriture de cache : il n'y a pas de terme à relever.
              cacheWriteTokens: null,
              model: resolvedModel,
              contextWindow: contextWindowForModel(resolvedModel),
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
   * Les appels sont émis à la fin du flux et non au fil de l'eau : leurs arguments arrivent en
   * fragments de JSON, et un objet à moitié écrit n'est pas exécutable. Le texte, lui, part
   * immédiatement — c'est ce que l'utilisateur lit pendant que le tour se joue.
   */
  streamTurn(
    turns: ChatTurn[],
    systemPrompt: string,
    tools: ToolSpec[]
  ): ReadableStream<AIChatChunk> {
    const apiKey = this.apiKey;

    return new ReadableStream<AIChatChunk>({
      async start(controller) {
        const model = openaiModel();

        let res: Response;
        try {
          res = await fetch(OPENAI_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              max_completion_tokens: CHAT_MAX_TOKENS,
              stream: true,
              stream_options: { include_usage: true },
              messages: toMessages(turns, systemPrompt),
              tools: tools.map((t) => ({
                type: 'function',
                function: {
                  name: t.name,
                  description: t.description,
                  parameters: t.inputSchema,
                },
              })),
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
            content: `\n\n[OpenAI API error ${res.status}: ${extractOpenAIError(body)}]`,
          });
          controller.close();
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        let usageChunk: OpenAIChunk['usage'] | null = null;
        let resolvedModel: string = model;
        // Indexé par la position que porte la trame, pas par l'ordre d'arrivée : deux appels
        // dans le même tour s'entrelacent, et concaténer leurs fragments à la file produirait
        // deux JSON invalides.
        const pending = new Map<number, { id: string; name: string; args: string }>();

        await forEachFrame(reader, (chunk) => {
          const delta = chunk.choices?.[0]?.delta;
          if (delta?.content) controller.enqueue({ type: 'text', content: delta.content });

          for (const call of delta?.tool_calls ?? []) {
            const index = call.index ?? 0;
            const entry = pending.get(index) ?? { id: '', name: '', args: '' };
            if (call.id) entry.id = call.id;
            if (call.function?.name) entry.name = call.function.name;
            if (call.function?.arguments) entry.args += call.function.arguments;
            pending.set(index, entry);
          }

          if (chunk.usage) usageChunk = chunk.usage;
          if (chunk.model) resolvedModel = chunk.model;
        });

        for (const [index, entry] of [...pending.entries()].sort((a, b) => a[0] - b[0])) {
          if (!entry.name) continue;
          let input: unknown = {};
          try {
            input = entry.args ? JSON.parse(entry.args) : {};
          } catch {
            // Arguments illisibles : l'outil les rejettera et le dira au modèle, ce qui vaut
            // mieux que de perdre l'appel en silence — sans réponse, la requête suivante échoue.
          }
          const toolCall: ToolCall = {
            id: entry.id || `openai-${index}`,
            name: entry.name,
            input,
          };
          controller.enqueue({ type: 'tool_call', call: toolCall });
        }

        if (usageChunk) {
          const usage: NonNullable<OpenAIChunk['usage']> = usageChunk;
          controller.enqueue({
            type: 'usage',
            data: {
              promptTokens: usage.prompt_tokens,
              completionTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
              cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? null,
              // OpenAI ne facture pas l'écriture de cache : il n'y a pas de terme à relever.
              cacheWriteTokens: null,
              model: resolvedModel,
              contextWindow: contextWindowForModel(resolvedModel),
            },
          });
        }

        controller.close();
      },
    });
  }
}
