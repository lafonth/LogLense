import type { AIStreamChunk } from '@/lib/ai/provider';
import type { AnalysisResult } from '@/types';
import { describe, expect, it, vi } from 'vitest';
import { POST } from '../route';

vi.mock('@/lib/ai/claude', () => ({
  ClaudeProvider: vi.fn().mockImplementation(() => ({
    stream: vi.fn().mockReturnValue(
      new ReadableStream<AIStreamChunk>({
        start(controller) {
          controller.enqueue({ type: 'text', content: 'Great rotation ' });
          controller.enqueue({ type: 'text', content: 'analysis here.' });
          controller.enqueue({
            type: 'usage',
            data: {
              promptTokens: 100,
              completionTokens: 20,
              totalTokens: 120,
              model: 'claude-sonnet-4-6',
              contextWindow: 200000,
            },
          });
          controller.close();
        },
      })
    ),
  })),
}));

const mockResult: AnalysisResult = {
  input: {
    characterName: 'Jumbaa',
    serverSlug: 'ysondre',
    region: 'EU',
    difficulty: 5,
    encounters: [{ id: 3306, name: 'Chimaerus' }],
    specId: 103,
  },
  bosses: [null],
  generatedAt: '2026-05-09T00:00:00.000Z',
};

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/ai-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('ai-report route', () => {
  it('returns SSE stream with text chunks', async () => {
    const req = makeRequest(mockResult, { 'x-ai-key': 'sk-ant-test' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const text = await res.text();
    expect(text).toContain('data: "Great rotation "');
    expect(text).toContain('data: "analysis here."');
    expect(text).toContain('data: "[DONE]"');
  });

  it('returns 401 when X-AI-Key header is missing', async () => {
    const req = makeRequest(mockResult);
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when X-AI-Key header is empty', async () => {
    const req = makeRequest(mockResult, { 'x-ai-key': '' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
