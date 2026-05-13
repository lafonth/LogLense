import type { AIProvider } from './provider';

interface OpenAIChunk {
  choices?: Array<{ delta?: { content?: string } }>;
}

export const GROQ_MODELS = [
  { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B — best quality (1k req/day)' },
  { id: 'llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B — balanced (1k req/day)' },
  { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B — unlimited (14k req/day)' },
] as const;

export type GroqModelId = (typeof GROQ_MODELS)[number]['id'];
export const DEFAULT_GROQ_MODEL: GroqModelId = 'llama-3.3-70b-versatile';

export class GroqProvider implements AIProvider {
  constructor(
    private apiKey: string,
    private model: GroqModelId = DEFAULT_GROQ_MODEL
  ) {}

  stream(prompt: string, systemPrompt: string): ReadableStream<string> {
    const apiKey = this.apiKey;
    const model = process.env.GROQ_MODEL ?? this.model;

    return new ReadableStream<string>({
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
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: prompt },
              ],
            }),
          });
        } catch (e) {
          controller.enqueue(`\n\n[Error: ${e instanceof Error ? e.message : 'Network error'}]`);
          controller.close();
          return;
        }

        if (!res.ok) {
          const body = await res.text();
          controller.enqueue(`\n\n[Groq API error ${res.status}: ${body}]`);
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
              if (text) controller.enqueue(text);
            } catch {
              // malformed chunk — skip
            }
          }
        }

        controller.close();
      },
    });
  }
}
