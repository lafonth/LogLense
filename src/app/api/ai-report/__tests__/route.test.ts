import type { AIStreamChunk } from '@/lib/ai/provider';
import type { AnalysisResult } from '@/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_GLOBAL_LIMIT, AI_GLOBAL_SUBJECT, AI_LIMIT } from '@/lib/labels/rate-limit';
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
              cachedTokens: null,
              cacheWriteTokens: null,
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

vi.mock('@/lib/ai/openai', () => ({
  OpenAIProvider: vi.fn().mockImplementation(() => ({
    stream: vi.fn().mockReturnValue(makeTextStream('OpenAI analysis.')),
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
    vi.stubEnv('ANTHROPIC_API_KEY', 'env-anthropic-key');
    getServerSession.mockResolvedValue({ user: { email: 'someone@example.com' } });
    redisIncrBy.mockResolvedValue(1);
    redisExpire.mockResolvedValue(undefined);
    redisAppend.mockResolvedValue(undefined);
  });

  it('returns SSE stream with text chunks', async () => {
    const res = await POST(makeRequest(mockResult));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const text = await res.text();
    expect(text).toContain('data: "Great rotation "');
    expect(text).toContain('data: "analysis here."');
    expect(text).toContain('data: "[DONE]"');
  });

  it('spends the server key — the caller has none to bring', async () => {
    const { ClaudeProvider } = await import('@/lib/ai/claude');
    const res = await POST(makeRequest(mockResult));

    expect(res.status).toBe(200);
    expect(ClaudeProvider).toHaveBeenCalledWith('env-anthropic-key');
  });

  // La brèche que le retrait du BYOK a fermée : un en-tête suffisait à sauter le quota.
  it('ignores a caller-supplied key and charges the quota all the same', async () => {
    const { ClaudeProvider } = await import('@/lib/ai/claude');
    const res = await POST(makeRequest(mockResult, { 'x-ai-key': 'sk-ant-mine' }));

    expect(res.status).toBe(200);
    expect(ClaudeProvider).toHaveBeenCalledWith('env-anthropic-key');
    expect(redisIncrBy).toHaveBeenCalled();
  });

  it('refuses an anonymous caller', async () => {
    getServerSession.mockResolvedValue(null);
    const res = await POST(makeRequest(mockResult));

    expect(res.status).toBe(401);
    expect(redisIncrBy).not.toHaveBeenCalled();
  });

  it('refuses when no provider is both offered and keyed', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const res = await POST(makeRequest(mockResult));

    expect(res.status).toBe(503);
  });

  it('uses GeminiProvider when x-ai-provider is gemini', async () => {
    vi.stubEnv('AI_PROVIDERS', 'gemini');
    vi.stubEnv('GEMINI_API_KEY', 'env-gemini-key');
    const { GeminiProvider } = await import('@/lib/ai/gemini');
    const res = await POST(makeRequest(mockResult, { 'x-ai-provider': 'gemini' }));

    expect(res.status).toBe(200);
    expect(GeminiProvider).toHaveBeenCalledWith('env-gemini-key');
    expect(await res.text()).toContain('Gemini analysis.');
  });

  it('uses OpenAIProvider when x-ai-provider is openai', async () => {
    vi.stubEnv('AI_PROVIDERS', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'env-openai-key');
    const { OpenAIProvider } = await import('@/lib/ai/openai');
    const res = await POST(makeRequest(mockResult, { 'x-ai-provider': 'openai' }));

    expect(res.status).toBe(200);
    expect(OpenAIProvider).toHaveBeenCalledWith('env-openai-key');
    expect(await res.text()).toContain('OpenAI analysis.');
  });

  it('uses GroqProvider when x-ai-provider is groq', async () => {
    vi.stubEnv('AI_PROVIDERS', 'groq');
    vi.stubEnv('GROQ_API_KEY', 'env-groq-key');
    const { GroqProvider } = await import('@/lib/ai/groq');
    const res = await POST(makeRequest(mockResult, { 'x-ai-provider': 'groq' }));

    expect(res.status).toBe(200);
    expect(GroqProvider).toHaveBeenCalledWith('env-groq-key', expect.any(String));
    expect(await res.text()).toContain('Groq analysis.');
  });

  it('serves Claude alone when nothing widens the offer', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'env-gemini-key');
    const res = await GET();

    expect((await res.json()).providers).toEqual(['claude']);
  });

  it('announces only what is both offered and keyed', async () => {
    vi.stubEnv('AI_PROVIDERS', 'claude,gemini,openai');
    vi.stubEnv('GEMINI_API_KEY', 'env-gemini-key');
    const res = await GET();

    // OpenAI est offert mais sans clé : l'annoncer serait annoncer un 503.
    expect((await res.json()).providers).toEqual(['claude', 'gemini']);
  });

  it('rejects a provider the deployment does not offer, key or not', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'env-gemini-key');
    const { GeminiProvider } = await import('@/lib/ai/gemini');
    const res = await POST(makeRequest(mockResult, { 'x-ai-provider': 'gemini' }));

    expect(res.status).toBe(400);
    expect(GeminiProvider).not.toHaveBeenCalled();
  });

  it('rejects an unknown provider instead of falling back on Claude', async () => {
    const { ClaudeProvider } = await import('@/lib/ai/claude');
    const res = await POST(makeRequest(mockResult, { 'x-ai-provider': 'bogus' }));

    expect(res.status).toBe(400);
    expect(ClaudeProvider).not.toHaveBeenCalled();
  });

  it('counts the generation against the account, then against everyone', async () => {
    const res = await POST(makeRequest(mockResult));

    expect(res.status).toBe(200);
    expect(redisIncrBy).toHaveBeenCalledTimes(2);
    const [account, shared] = vi.mocked(redisIncrBy).mock.calls.map((c) => String(c[0]));
    expect(account).toContain('ratelimit:ai');
    expect(account).not.toContain(`:${AI_GLOBAL_SUBJECT}:`);
    expect(shared).toContain(`ratelimit:ai:${AI_GLOBAL_SUBJECT}:`);
  });

  it('refuses past the hourly ceiling and says when to come back', async () => {
    redisIncrBy.mockResolvedValue(AI_LIMIT + 1);
    const res = await POST(makeRequest(mockResult));

    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  // Le compteur commun ne se touche pas quand le personnel a déjà refusé : un seul compte qui
  // martèle fermerait sinon la porte à tous les autres.
  it('leaves the shared counter alone once the account one has refused', async () => {
    redisIncrBy.mockResolvedValue(AI_LIMIT + 1);
    await POST(makeRequest(mockResult));

    expect(redisIncrBy).toHaveBeenCalledTimes(1);
  });

  it('refuses past the shared ceiling even when the account is within its own', async () => {
    redisIncrBy.mockResolvedValueOnce(1).mockResolvedValueOnce(AI_GLOBAL_LIMIT + 1);
    const res = await POST(makeRequest(mockResult));

    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  // Sur une dépense, Redis muet ferme le robinet : un jeton non compté est un jeton sans
  // plafond.
  it('refuses when the counter cannot be read', async () => {
    redisIncrBy.mockRejectedValue(new Error('upstash down'));
    const res = await POST(makeRequest(mockResult));

    expect(res.status).toBe(503);
  });

  it('rejects an unknown Groq model rather than silently substituting one', async () => {
    vi.stubEnv('AI_PROVIDERS', 'groq');
    vi.stubEnv('GROQ_API_KEY', 'env-groq-key');
    const res = await POST(
      makeRequest(mockResult, { 'x-ai-provider': 'groq', 'x-ai-model': 'gpt-9' })
    );

    expect(res.status).toBe(400);
  });

  it('rejects a body whose shape the prompt cannot be built from', async () => {
    const res = await POST(makeRequest({ input: {}, bosses: [] }));

    expect(res.status).toBe(400);
  });

  it('rejects a body past the size ceiling before building anything', async () => {
    const { ClaudeProvider } = await import('@/lib/ai/claude');
    const fat = { ...mockResult, padding: 'x'.repeat(600_000) };

    const res = await POST(makeRequest(fat));

    expect(res.status).toBe(413);
    expect(ClaudeProvider).not.toHaveBeenCalled();
  });

  // Le quota se dépense sur une requête qui produira un rapport, pas sur une déjà refusée.
  it('charges no quota for a body it is about to reject', async () => {
    await POST(makeRequest({ input: {}, bosses: [] }));

    expect(redisIncrBy).not.toHaveBeenCalled();
  });
});
