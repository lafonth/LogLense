import type { AnalysisResult } from '@/types';
import { ClaudeProvider } from '@/lib/ai/claude';
import { GeminiProvider } from '@/lib/ai/gemini';
import { buildAnalysisPrompt, SYSTEM_PROMPT } from '@/lib/ai/prompt';

export const runtime = 'edge';

export async function POST(req: Request) {
  const apiKey = req.headers.get('x-ai-key');

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'X-AI-Key header is required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const providerName = req.headers.get('x-ai-provider') ?? 'claude';
  const result = (await req.json()) as AnalysisResult;
  const provider = providerName === 'gemini' ? new GeminiProvider(apiKey) : new ClaudeProvider(apiKey);
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
}
