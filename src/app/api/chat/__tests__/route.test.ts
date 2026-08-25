import type { AIStreamChunk } from '@/lib/ai/provider';
import type { BossResult } from '@/types';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from '../route';

const { getServerSession, readSnapshot, runChatLoop, consumeAiQuota, recordChat } = vi.hoisted(
  () => ({
    getServerSession: vi.fn(),
    readSnapshot: vi.fn(),
    runChatLoop: vi.fn(),
    consumeAiQuota: vi.fn(),
    recordChat: vi.fn(),
  })
);

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
vi.mock('@/lib/labels/rate-limit', () => ({ consumeAiQuota }));
vi.mock('@/lib/labels/identity', () => ({ hashUserId: vi.fn().mockReturnValue('hashed') }));

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

const AI_KEYS = ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'GROQ_API_KEY'] as const;

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of AI_KEYS) delete process.env[k];

  getServerSession.mockResolvedValue({ user: { email: 'raider@example.com' } });
  readSnapshot.mockResolvedValue(mockBoss);
  consumeAiQuota.mockResolvedValue({ allowed: true });
  recordChat.mockResolvedValue(undefined);
  runChatLoop.mockReturnValue(
    new ReadableStream<AIStreamChunk>({
      start(controller) {
        controller.enqueue({ type: 'text', content: 'Réponse.' });
        controller.close();
      },
    })
  );
});

afterEach(() => {
  for (const k of AI_KEYS) delete process.env[k];
});

describe('chat route — le fournisseur', () => {
  it('retombe sur Claude quand aucun en-tête ne le désigne', async () => {
    const { ClaudeProvider } = await import('@/lib/ai/claude');

    const res = await POST(makeRequest({ 'x-ai-key': 'sk-ant-perso' }));

    expect(res.status).toBe(200);
    expect(ClaudeProvider).toHaveBeenCalledWith('sk-ant-perso');
  });

  it('construit GeminiProvider quand x-ai-provider vaut gemini', async () => {
    const { GeminiProvider } = await import('@/lib/ai/gemini');

    const res = await POST(makeRequest({ 'x-ai-key': 'AIza-perso', 'x-ai-provider': 'gemini' }));

    expect(res.status).toBe(200);
    expect(GeminiProvider).toHaveBeenCalledWith('AIza-perso');
  });

  it('construit OpenAIProvider quand x-ai-provider vaut openai', async () => {
    const { OpenAIProvider } = await import('@/lib/ai/openai');

    const res = await POST(makeRequest({ 'x-ai-key': 'sk-perso', 'x-ai-provider': 'openai' }));

    expect(res.status).toBe(200);
    expect(OpenAIProvider).toHaveBeenCalledWith('sk-perso');
  });

  // Groq n'implémente pas `streamTurn`. Le refuser ici plutôt que retomber en silence sur Claude :
  // sinon notre clé paie pour un fournisseur que l'utilisateur croyait avoir choisi.
  it('refuse Groq en 400, sans retomber sur Claude', async () => {
    const { ClaudeProvider } = await import('@/lib/ai/claude');

    const res = await POST(makeRequest({ 'x-ai-key': 'gsk-perso', 'x-ai-provider': 'groq' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Unsupported chat provider — expected gemini, claude, openai',
    });
    expect(ClaudeProvider).not.toHaveBeenCalled();
  });

  it('refuse un nom de fournisseur inconnu en 400', async () => {
    const res = await POST(makeRequest({ 'x-ai-key': 'k', 'x-ai-provider': 'mistral' }));

    expect(res.status).toBe(400);
  });

  it('accepte la clé serveur du fournisseur demandé, sans en-tête de clé', async () => {
    process.env.OPENAI_API_KEY = 'sk-serveur';
    const { OpenAIProvider } = await import('@/lib/ai/openai');

    const res = await POST(makeRequest({ 'x-ai-provider': 'openai' }));

    expect(res.status).toBe(200);
    expect(OpenAIProvider).toHaveBeenCalledWith('sk-serveur');
    // Voie clé serveur : le quota se dépense, contrairement au BYOK.
    expect(consumeAiQuota).toHaveBeenCalled();
  });

  // La clé serveur de Claude ne rend pas OpenAI utilisable : chaque fournisseur lit la sienne.
  it("refuse en 401 quand aucune clé n'existe pour le fournisseur demandé", async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-serveur';

    const res = await POST(makeRequest({ 'x-ai-provider': 'openai' }));

    expect(res.status).toBe(401);
  });

  // La session est exigée avant tout le reste, BYOK comprise : une clé personnelle achète le
  // modèle, pas le droit de lire nos données dérivées de Warcraft Logs.
  it('exige la session même avec une clé personnelle', async () => {
    getServerSession.mockResolvedValue(null);

    const res = await POST(makeRequest({ 'x-ai-key': 'sk-perso', 'x-ai-provider': 'openai' }));

    expect(res.status).toBe(401);
    expect(readSnapshot).not.toHaveBeenCalled();
  });
});

describe('chat route — les fournisseurs configurés', () => {
  it('ne liste que les fournisseurs outillés dont la clé serveur existe', async () => {
    process.env.OPENAI_API_KEY = 'sk-serveur';
    process.env.GROQ_API_KEY = 'gsk-serveur';

    const res = await GET();

    expect(res.status).toBe(200);
    // Groq a beau être configuré, il n'est pas outillé : le proposer ferait promettre au chat un
    // fournisseur que le POST refuse en 400.
    expect(await res.json()).toEqual({ configuredProviders: ['openai'] });
  });

  it("rend une liste vide quand aucune clé serveur n'est posée", async () => {
    const res = await GET();

    expect(await res.json()).toEqual({ configuredProviders: [] });
  });
});
