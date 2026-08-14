import type { AIStreamChunk } from '@/lib/ai/provider';
import type { AnalysisResult } from '@/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_LIMIT } from '@/lib/labels/rate-limit';
import { GET, POST } from '../route';

const { getServerSession, redisAppend, redisIncrBy, redisExpire } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  redisAppend: vi.fn(),
  redisIncrBy: vi.fn(),
  redisExpire: vi.fn(),
}));

vi.mock('next-auth/next', () => ({ getServerSession }));
vi.mock('@/lib/redis', () => ({ redisAppend, redisIncrBy, redisExpire }));

function makeTextStream(text: string) {
  return new ReadableStream<AIStreamChunk>({
    start(controller) {
      controller.enqueue({ type: 'text', content: text });
      controller.close();
    },
  });
}

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
              model: 'claude-sonnet-5',
              contextWindow: 200000,
            },
          });
          controller.close();
        },
      })
    ),
  })),
}));

vi.mock('@/lib/ai/gemini', () => ({
  GeminiProvider: vi.fn().mockImplementation(() => ({
    stream: vi.fn().mockReturnValue(makeTextStream('Gemini analysis.')),
  })),
}));

vi.mock('@/lib/ai/groq', () => ({
  GroqProvider: vi.fn().mockImplementation(() => ({
    stream: vi.fn().mockReturnValue(makeTextStream('Groq analysis.')),
  })),
  DEFAULT_GROQ_MODEL: 'llama-3.3-70b-versatile',
  GROQ_MODELS: [{ id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', contextWindow: 131072 }],
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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('LABEL_SALT', 'pepper');
    getServerSession.mockResolvedValue(null);
    redisIncrBy.mockResolvedValue(1);
    redisExpire.mockResolvedValue(undefined);
    redisAppend.mockResolvedValue(undefined);
  });

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

  it('uses GeminiProvider when x-ai-provider is gemini', async () => {
    const { GeminiProvider } = await import('@/lib/ai/gemini');
    const req = makeRequest(mockResult, { 'x-ai-key': 'gemini-key', 'x-ai-provider': 'gemini' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(GeminiProvider).toHaveBeenCalledWith('gemini-key');
    const text = await res.text();
    expect(text).toContain('Gemini analysis.');
  });

  it('uses GroqProvider when x-ai-provider is groq', async () => {
    const { GroqProvider } = await import('@/lib/ai/groq');
    const req = makeRequest(mockResult, { 'x-ai-key': 'groq-key', 'x-ai-provider': 'groq' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(GroqProvider).toHaveBeenCalledWith('groq-key', expect.any(String));
    const text = await res.text();
    expect(text).toContain('Groq analysis.');
  });

  it('uses env key when x-ai-provider is gemini and no header key', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'env-gemini-key');
    getServerSession.mockResolvedValue({ user: { email: 'someone@example.com' } });
    const { GeminiProvider } = await import('@/lib/ai/gemini');
    const req = makeRequest(mockResult, { 'x-ai-provider': 'gemini' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(GeminiProvider).toHaveBeenCalledWith('env-gemini-key');
  });

  it('returns configured providers list via GET', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'key');
    const res = await GET();
    const json = await res.json();
    expect(json.configuredProviders).toContain('claude');
  });

  // BYOK : la clé de l'appelant l'emporte sur celle du serveur. L'inverse faisait payer
  // l'hôte alors même que l'utilisateur avait fourni la sienne.
  it('spends the caller key rather than the server one when both exist', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'env-anthropic-key');
    const { ClaudeProvider } = await import('@/lib/ai/claude');
    const res = await POST(makeRequest(mockResult, { 'x-ai-key': 'sk-ant-mine' }));

    expect(res.status).toBe(200);
    expect(ClaudeProvider).toHaveBeenCalledWith('sk-ant-mine');
  });

  it('asks nothing of a caller who brings a key — no session, no quota', async () => {
    const res = await POST(makeRequest(mockResult, { 'x-ai-key': 'sk-ant-mine' }));

    expect(res.status).toBe(200);
    expect(getServerSession).not.toHaveBeenCalled();
    expect(redisIncrBy).not.toHaveBeenCalled();
  });

  it('refuses the server key to an anonymous caller', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'env-anthropic-key');
    const res = await POST(makeRequest(mockResult));

    expect(res.status).toBe(401);
    expect(redisIncrBy).not.toHaveBeenCalled();
  });

  it('lets a signed-in caller spend the server key, and counts it', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'env-anthropic-key');
    getServerSession.mockResolvedValue({ user: { email: 'someone@example.com' } });

    const res = await POST(makeRequest(mockResult));

    expect(res.status).toBe(200);
    expect(redisIncrBy).toHaveBeenCalledTimes(1);
    expect(vi.mocked(redisIncrBy).mock.calls[0][0]).toContain('ratelimit:ai');
  });

  it('refuses past the hourly ceiling and says when to come back', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'env-anthropic-key');
    getServerSession.mockResolvedValue({ user: { email: 'someone@example.com' } });
    redisIncrBy.mockResolvedValue(AI_LIMIT + 1);

    const res = await POST(makeRequest(mockResult));

    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  // Sur une dépense, Redis muet ferme le robinet : un jeton non compté est un jeton sans
  // plafond.
  it('refuses the server key when the counter cannot be read', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'env-anthropic-key');
    getServerSession.mockResolvedValue({ user: { email: 'someone@example.com' } });
    redisIncrBy.mockRejectedValue(new Error('upstash down'));

    const res = await POST(makeRequest(mockResult));

    expect(res.status).toBe(503);
  });

  it('rejects an unknown provider instead of falling back on Claude', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'env-anthropic-key');
    const { ClaudeProvider } = await import('@/lib/ai/claude');
    const res = await POST(makeRequest(mockResult, { 'x-ai-provider': 'bogus' }));

    expect(res.status).toBe(400);
    expect(ClaudeProvider).not.toHaveBeenCalled();
  });

  it('rejects an unknown Groq model rather than silently substituting one', async () => {
    const res = await POST(
      makeRequest(mockResult, {
        'x-ai-key': 'groq-key',
        'x-ai-provider': 'groq',
        'x-ai-model': 'gpt-9',
      })
    );

    expect(res.status).toBe(400);
  });

  it('rejects a body whose shape the prompt cannot be built from', async () => {
    const res = await POST(makeRequest({ input: {}, bosses: [] }, { 'x-ai-key': 'sk-ant-mine' }));

    expect(res.status).toBe(400);
  });

  it('rejects a body past the size ceiling before building anything', async () => {
    const { ClaudeProvider } = await import('@/lib/ai/claude');
    const fat = { ...mockResult, padding: 'x'.repeat(600_000) };

    const res = await POST(makeRequest(fat, { 'x-ai-key': 'sk-ant-mine' }));

    expect(res.status).toBe(413);
    expect(ClaudeProvider).not.toHaveBeenCalled();
  });
});
