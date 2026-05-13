import type { GroqModelId } from '@/lib/ai/groq';
import type { AIStreamChunk } from '@/lib/ai/provider';
import type { AnalysisResult, TalentNode } from '@/types';

import feralTalents from '@/data/feral-druid-talents.json';
import { ClaudeProvider } from '@/lib/ai/claude';
import { GeminiProvider } from '@/lib/ai/gemini';
import { DEFAULT_GROQ_MODEL, GroqProvider } from '@/lib/ai/groq';
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
  if (process.env.GROQ_API_KEY) configured.push('groq');
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
        : providerName === 'groq'
          ? (process.env.GROQ_API_KEY ?? '')
          : (process.env.ANTHROPIC_API_KEY ?? '');

    const apiKey = envKey || headerKey;

    if (!apiKey) {
      return jsonResponse(
        { error: 'API key required — enter one in the UI or set it in the server environment' },
        401
      );
    }

    const groqModel = (req.headers.get('x-ai-model') ?? DEFAULT_GROQ_MODEL) as GroqModelId;
    const result = (await req.json()) as AnalysisResult;
    const provider =
      providerName === 'gemini'
        ? new GeminiProvider(apiKey)
        : providerName === 'groq'
          ? new GroqProvider(apiKey, groqModel)
          : new ClaudeProvider(apiKey);
    const prompt = buildAnalysisPrompt(result, feralTalents as TalentNode[]);
    const chunks = provider.stream(prompt, SYSTEM_PROMPT);

    const encoder = new TextEncoder();
    const sseStream = new TransformStream<AIStreamChunk, Uint8Array>({
      transform(chunk, controller) {
        if (chunk.type === 'text') {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk.content)}\n\n`));
        } else {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ _meta: 'usage', ...chunk.data })}\n\n`)
          );
        }
      },
      flush(controller) {
        controller.enqueue(encoder.encode('data: "[DONE]"\n\n'));
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
