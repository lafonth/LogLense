import type { AIProvider } from './provider';

interface GeminiChunk {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

interface GeminiErrorBody {
  error?: { message?: string; status?: string };
}

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

  stream(prompt: string, systemPrompt: string): ReadableStream<string> {
    const apiKey = this.apiKey;

    return new ReadableStream<string>({
      async start(controller) {
        // gemini-1.5-flash has the most reliable free tier across all project types
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`;

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
          controller.enqueue(`\n\n[Error: ${e instanceof Error ? e.message : 'Network error'}]`);
          controller.close();
          return;
        }

        if (!res.ok) {
          const body = await res.text();
          controller.enqueue(`\n\n[Gemini API error ${res.status}: ${extractGeminiError(body)}]`);
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
            if (!json) continue;
            try {
              const chunk = JSON.parse(json) as GeminiChunk;
              const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
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
