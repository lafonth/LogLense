import type { AIStreamChunk } from '@/lib/ai/provider';
import type { BossResult } from '@/types';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_GLOBAL_LIMIT, AI_GLOBAL_SUBJECT, AI_LIMIT } from '@/lib/labels/rate-limit';
import { GET, POST } from '../route';

const {
  getServerSession,
  readSnapshot,
  runChatLoop,
  recordChat,
  redisAppend,
  redisIncrBy,
  redisExpire,
} = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  readSnapshot: vi.fn(),
  runChatLoop: vi.fn(),
  recordChat: vi.fn(),
  redisAppend: vi.fn(),
  redisIncrBy: vi.fn(),
  redisExpire: vi.fn(),
}));

vi.mock('next-auth/next', () => ({ getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/wcl/result-snapshot', () => ({
  readSnapshot,
  snapshotKey: vi.fn().mockReturnValue('snapshot:key'),
}));
vi.mock('@/lib/talent-loader', () => ({ getTalentNodes: vi.fn().mockReturnValue([]) }));
vi.mock('@/lib/ai/chat-prompt', () => ({
  buildChatSystemPrompt: vi.fn().mockReturnValue('system'),
}));
vi.mock('@/lib/ai/chat-loop', () => ({ runChatLoop }));
vi.mock('@/lib/labels/record-chat', () => ({ recordChat }));

// Redis plutôt que `rate-limit` : c'est la paire de compteurs qu'on veut voir tourner, pas un
// verdict qu'on aurait posé soi-même.
vi.mock('@/lib/redis', () => ({ redisAppend, redisIncrBy, redisExpire }));

vi.mock('@/lib/ai/claude', () => ({ ClaudeProvider: vi.fn() }));
vi.mock('@/lib/ai/gemini', () => ({ GeminiProvider: vi.fn() }));
vi.mock('@/lib/ai/openai', () => ({ OpenAIProvider: vi.fn() }));

/** L'instantané relu par la route. Seul ce que `makePromoter` touche a besoin d'être présent. */
const mockBoss = {
  specId: 62,
  character: { stats: { avgIlvl: 660 }, eligibility: null, killTime: '4:12' },
} as unknown as BossResult;

const body = {
  snapshot: {
    kind: 'character',
    region: 'eu',
    serverSlug: 'hyjal',
    characterName: 'Tester',
    encounterId: 2917,
    difficulty: 5,
    specId: 62,
  },
  messages: [{ role: 'user', text: 'Pourquoi je suis derrière ?' }],
};

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv('LABEL_SALT', 'pepper');
  vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-serveur');

  getServerSession.mockResolvedValue({ user: { email: 'raider@example.com' } });
  readSnapshot.mockResolvedValue(mockBoss);
  recordChat.mockResolvedValue(undefined);
  redisIncrBy.mockResolvedValue(1);
  redisExpire.mockResolvedValue(undefined);
  redisAppend.mockResolvedValue(undefined);
  runChatLoop.mockReturnValue(
    new ReadableStream<AIStreamChunk>({
      start(controller) {
        controller.enqueue({ type: 'text', content: 'Réponse.' });
        controller.close();
      },
    })
  );
});

describe('chat route — le fournisseur', () => {
  it('spends the server key when no header names a provider', async () => {
    const { ClaudeProvider } = await import('@/lib/ai/claude');

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(ClaudeProvider).toHaveBeenCalledWith('sk-ant-serveur');
  });

  // La clé personnelle n'achetait le modèle qu'à condition de payer sa facture. Elle n'existe
  // plus : l'en-tête est du texte inerte, et la requête passe sur notre clé et notre quota.
  it('ignores a key brought by the caller', async () => {
    const { ClaudeProvider } = await import('@/lib/ai/claude');

    const res = await POST(makeRequest({ 'x-ai-key': 'sk-ant-perso' }));

    expect(res.status).toBe(200);
    expect(ClaudeProvider).toHaveBeenCalledWith('sk-ant-serveur');
    expect(redisIncrBy).toHaveBeenCalled();
  });

  it('builds GeminiProvider when the deployment offers it', async () => {
    vi.stubEnv('AI_PROVIDERS', 'claude,gemini');
    vi.stubEnv('GEMINI_API_KEY', 'AIza-serveur');
    const { GeminiProvider } = await import('@/lib/ai/gemini');

    const res = await POST(makeRequest({ 'x-ai-provider': 'gemini' }));

    expect(res.status).toBe(200);
    expect(GeminiProvider).toHaveBeenCalledWith('AIza-serveur');
  });

  it('builds OpenAIProvider when the deployment offers it', async () => {
    vi.stubEnv('AI_PROVIDERS', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'sk-serveur');
    const { OpenAIProvider } = await import('@/lib/ai/openai');

    const res = await POST(makeRequest({ 'x-ai-provider': 'openai' }));

    expect(res.status).toBe(200);
    expect(OpenAIProvider).toHaveBeenCalledWith('sk-serveur');
  });

  // Groq n'implémente pas `streamTurn`. Le refuser ici plutôt que retomber en silence sur Claude :
  // sinon notre clé paie pour un fournisseur que l'utilisateur croyait avoir choisi.
  it('refuses Groq in 400, offered and keyed as it may be', async () => {
    vi.stubEnv('AI_PROVIDERS', 'claude,groq');
    vi.stubEnv('GROQ_API_KEY', 'gsk-serveur');
    const { ClaudeProvider } = await import('@/lib/ai/claude');

    const res = await POST(makeRequest({ 'x-ai-provider': 'groq' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Unsupported chat provider — expected claude',
    });
    expect(ClaudeProvider).not.toHaveBeenCalled();
  });

  it('refuses an unknown provider name in 400', async () => {
    const res = await POST(makeRequest({ 'x-ai-provider': 'mistral' }));

    expect(res.status).toBe(400);
  });

  // Le catalogue reste dans le code, l'offre non : une clé posée ne suffit pas à rouvrir un
  // fournisseur que le déploiement ne propose pas.
  it('refuses a keyed provider the deployment does not offer', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-serveur');
    const { OpenAIProvider } = await import('@/lib/ai/openai');

    const res = await POST(makeRequest({ 'x-ai-provider': 'openai' }));

    expect(res.status).toBe(400);
    expect(OpenAIProvider).not.toHaveBeenCalled();
  });

  it('refuses in 503 when nothing is both offered and keyed', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');

    const res = await POST(makeRequest());

    expect(res.status).toBe(503);
  });

  // La session est exigée avant tout le reste : lire un instantané, c'est lire une analyse
  // dérivée de Warcraft Logs.
  it('demands the session before touching the snapshot', async () => {
    getServerSession.mockResolvedValue(null);

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    expect(readSnapshot).not.toHaveBeenCalled();
  });
});

describe('chat route — le quota', () => {
  it('counts the turn against the account, then against everyone', async () => {
    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(redisIncrBy).toHaveBeenCalledTimes(2);
    const [account, shared] = vi.mocked(redisIncrBy).mock.calls.map((c) => String(c[0]));
    expect(account).toContain('ratelimit:ai');
    expect(account).not.toContain(`:${AI_GLOBAL_SUBJECT}:`);
    expect(shared).toContain(`ratelimit:ai:${AI_GLOBAL_SUBJECT}:`);
  });

  it('refuses in 429 past the account ceiling', async () => {
    redisIncrBy.mockResolvedValue(AI_LIMIT + 1);

    const res = await POST(makeRequest());

    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
  });

  it('refuses in 429 past the shared ceiling, account in order', async () => {
    redisIncrBy.mockResolvedValueOnce(1).mockResolvedValueOnce(AI_GLOBAL_LIMIT + 1);

    const res = await POST(makeRequest());

    expect(res.status).toBe(429);
  });

  // Le quota se dépense sur un tour qui produira une réponse. Un instantané expiré n'en produit
  // pas : le compteur ne bouge pas.
  it('charges nothing once the snapshot has expired', async () => {
    readSnapshot.mockResolvedValue(null);

    const res = await POST(makeRequest());

    expect(res.status).toBe(410);
    expect(redisIncrBy).not.toHaveBeenCalled();
  });
});

describe('chat route — les fournisseurs servis', () => {
  it('serves Claude alone while nothing widens the offer', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-serveur');

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ providers: ['claude'] });
  });

  it('announces only the tool-capable, offered and keyed', async () => {
    vi.stubEnv('AI_PROVIDERS', 'groq,claude,openai');
    vi.stubEnv('GROQ_API_KEY', 'gsk-serveur');

    const res = await GET();

    // Groq a beau être offert et configuré, il n'est pas outillé : le proposer ferait promettre
    // au chat un fournisseur que le POST refuse en 400. OpenAI est offert sans clé.
    expect(await res.json()).toEqual({ providers: ['claude'] });
  });

  it('returns an empty list when no server key is set', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');

    const res = await GET();

    expect(await res.json()).toEqual({ providers: [] });
  });
});
