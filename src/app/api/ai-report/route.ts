import type { AnalysisResult } from '@/types';
import { ClaudeProvider } from '@/lib/ai/claude';
import { GeminiProvider } from '@/lib/ai/gemini';
import { buildAnalysisPrompt, SYSTEM_PROMPT } from '@/lib/ai/prompt';

export const runtime = 'edge';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function GET() {
  const configured: string[] = [];
  if (process.env.GEMINI_API_KEY) configured.push('gemini');
  if (process.env.ANTHROPIC_API_KEY) configured.push('claude');
  return jsonResponse({ configuredProviders: configured });
}

export async function POST(req: Request) {
  try {
    const headerKey = req.headers.get('x-ai-key') ?? '';
    const providerName = req.headers.get('x-ai-provider') ?? 'claude';

    const envKey =
      providerName === 'gemini'
        ? (process.env.GEMINI_API_KEY ?? '')
        : (process.env.ANTHROPIC_API_KEY ?? '');

    const apiKey = envKey || headerKey;

    if (!apiKey) {
      return jsonResponse(
        { error: 'API key required — enter one in the UI or set it in the server environment' },
        401
      );
    }

    const result = (await req.json()) as AnalysisResult;
    const provider =
      providerName === 'gemini' ? new GeminiProvider(apiKey) : new ClaudeProvider(apiKey);
    const prompt = buildAnalysisPrompt(result);
    const chunks = provider.stream(prompt, SYSTEM_PROMPT);

    const encoder = new TextEncoder();
    const sseStream = new TransformStream<string, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
      },
      flush(controller) {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      },
    });

    chunks.pipeTo(sseStream.writable).catch(() => {});

    return new Response(sseStream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'Internal error' }, 500);
  }
}
