import type { AIProvider, AIStreamChunk } from './provider';

interface OpenAIChunk {
  choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  model?: string;
}

export const GROQ_MODELS = [
  {
    id: 'openai/gpt-oss-120b',
    label: 'GPT-OSS 120B — best quality (1k req/day)',
    contextWindow: 131072,
  },
  {
    id: 'llama-3.3-70b-versatile',
    label: 'Llama 3.3 70B — balanced (1k req/day)',
    contextWindow: 131072,
  },
  {
    id: 'llama-3.1-8b-instant',
    label: 'Llama 3.1 8B — fastest (14.4k req/day)',
    contextWindow: 131072,
  },
] as const;

export type GroqModelId = (typeof GROQ_MODELS)[number]['id'];
export const DEFAULT_GROQ_MODEL: GroqModelId = 'openai/gpt-oss-120b';

function contextWindowForModel(model: string): number {
  return GROQ_MODELS.find((m) => m.id === model)?.contextWindow ?? 131072;
}

export class GroqProvider implements AIProvider {
  constructor(
    private apiKey: string,
    private model: GroqModelId = DEFAULT_GROQ_MODEL
  ) {}

  stream(prompt: string, systemPrompt: string): ReadableStream<AIStreamChunk> {
    const apiKey = this.apiKey;
    // Le modèle vient de l'appelant, jamais de l'environnement : sur une clé qu'il fournit
    // lui-même, c'est lui qui décide ce qu'il paie.
    const model = this.model;

    return new ReadableStream<AIStreamChunk>({
      async start(controller) {
        let res: Response;
        try {
          res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              max_tokens: 1500,
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
            content: `\n\n[Groq API error ${res.status}: ${body}]`,
          });
          controller.close();
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let usageChunk: OpenAIChunk['usage'] | null = null;
        // Le modèle que Groq dit avoir servi, qui peut différer de celui demandé.
        let resolvedModel: string = model;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const json = line.slice(6).trim();
            if (json === '[DONE]') break;
            try {
              const chunk = JSON.parse(json) as OpenAIChunk;
              const text = chunk.choices?.[0]?.delta?.content;
              if (text) controller.enqueue({ type: 'text', content: text });
              if (chunk.usage) usageChunk = chunk.usage;
              if (chunk.model) resolvedModel = chunk.model;
            } catch {
              // malformed chunk — skip
            }
          }
        }

        if (usageChunk) {
          controller.enqueue({
            type: 'usage',
            data: {
              promptTokens: usageChunk.prompt_tokens,
              completionTokens: usageChunk.completion_tokens,
              totalTokens: usageChunk.total_tokens,
              // Groq ne rend aucun terme de cache. `null` dit non mesuré, pas nul.
              cachedTokens: null,
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
