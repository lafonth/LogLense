import type { AIProvider } from './provider';

interface OpenAIChunk {
  choices?: Array<{ delta?: { content?: string } }>;
}

export class GroqProvider implements AIProvider {
  constructor(private apiKey: string) {}

  stream(prompt: string, systemPrompt: string): ReadableStream<string> {
    const apiKey = this.apiKey;

    return new ReadableStream<string>({
      async start(controller) {
        const model = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';

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
