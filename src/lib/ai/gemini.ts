import type { AIProvider, AIStreamChunk } from './provider';

interface GeminiChunk {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
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

function extractGeminiError(body: string): string {
  try {
    const parsed = JSON.parse(body) as GeminiErrorBody;
    return parsed.error?.message?.split('\n')[0] ?? body;
  } catch {
    return body;
  }
}

export class GeminiProvider implements AIProvider {
  constructor(private apiKey: string) {}

  stream(prompt: string, systemPrompt: string): ReadableStream<AIStreamChunk> {
    const apiKey = this.apiKey;

    return new ReadableStream<AIStreamChunk>({
      async start(controller) {
        const model = process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

        let res: Response;
        try {
          res = await fetch(url, {
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

        const decoder = new TextDecoder();
        let buffer = '';
        let lastUsage: GeminiChunk['usageMetadata'] | undefined;
        let resolvedModel = model;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const json = line.slice(6).trim();
            if (!json) continue;
            try {
              const chunk = JSON.parse(json) as GeminiChunk;
              const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) controller.enqueue({ type: 'text', content: text });
              if (chunk.usageMetadata) lastUsage = chunk.usageMetadata;
              if (chunk.modelVersion) resolvedModel = chunk.modelVersion;
            } catch {
              // malformed chunk — skip
            }
          }
        }

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
              contextWindow: GEMINI_CONTEXT_WINDOWS[resolvedModel] ?? 1048576,
            },
          });
        }

        controller.close();
      },
    });
  }
}
