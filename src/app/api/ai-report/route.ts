import type { GroqModelId } from '@/lib/ai/groq';
import type { AIStreamChunk } from '@/lib/ai/provider';
import type { AnalysisResult } from '@/types';
import { getServerSession } from 'next-auth/next';

import { ClaudeProvider } from '@/lib/ai/claude';
import { GeminiProvider } from '@/lib/ai/gemini';
import { DEFAULT_GROQ_MODEL, GROQ_MODELS, GroqProvider } from '@/lib/ai/groq';
import { buildAnalysisPrompt, SYSTEM_PROMPT } from '@/lib/ai/prompt';
import { authOptions } from '@/lib/auth';
import { hashUserId } from '@/lib/labels/identity';
import { consumeAiQuota } from '@/lib/labels/rate-limit';
import { recordAdvice } from '@/lib/labels/record-advice';
import { getTalentNodes } from '@/lib/talent-loader';

export const runtime = 'nodejs';

/**
 * Les seuls fournisseurs acceptés. La liste est fermée parce qu'un nom inconnu retombait
 * silencieusement sur Claude, donc sur la clé serveur : un en-tête mal orthographié suffisait
 * à faire payer l'hôte.
 */
const PROVIDERS = ['claude', 'gemini', 'groq'] as const;
type ProviderName = (typeof PROVIDERS)[number];

/**
 * Plafond du corps entrant. Une analyse complète d'un raid tient largement en dessous ; le
 * plafond borne ce qu'un appelant peut envoyer construire un prompt.
 */
const MAX_BODY_BYTES = 512_000;

/** Un palier ne compte pas quarante boss. Borne la boucle de `buildAnalysisPrompt`. */
const MAX_BOSSES = 40;

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function isProviderName(v: string): v is ProviderName {
  return (PROVIDERS as readonly string[]).includes(v);
}

function envKeyFor(provider: ProviderName): string {
  if (provider === 'gemini') return process.env.GEMINI_API_KEY ?? '';
  if (provider === 'groq') return process.env.GROQ_API_KEY ?? '';
  return process.env.ANTHROPIC_API_KEY ?? '';
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Valide la forme minimale dont la route dépend, ou rend `null`.
 *
 * Ce que la route lit elle-même — `input.specId` pour charger l'arbre de talents, `bosses`
 * pour l'empreinte — est vérifié ici ; le reste est du contenu de prompt, borné par la
 * taille du corps et non par un schéma qu'il faudrait tenir à jour à chaque champ ajouté.
 */
function parseAnalysisResult(raw: unknown): AnalysisResult | null {
  if (!isRecord(raw)) return null;

  const { input, bosses } = raw;
  if (!isRecord(input) || !Number.isInteger(input.specId)) return null;
  if (!Array.isArray(bosses) || bosses.length === 0 || bosses.length > MAX_BOSSES) return null;

  return raw as unknown as AnalysisResult;
}

/**
 * Garde de la voie « clé serveur » : session obligatoire, puis quota horaire par compte.
 *
 * Rend la réponse de refus, ou `null` quand la dépense est autorisée. La voie BYOK ne passe
 * jamais ici : elle ne dépense ni notre clé ni notre quota, et une friction y serait
 * gratuite. Ce n'est pas dire qu'elle ne touche à rien de nôtre — elle atteint
 * `recordAdvice`, donc le corpus. C'est `recordAdvice` qui borne cette écriture-là, en
 * refusant d'écrire sans identité ; cette garde ne couvre que la dépense.
 */
async function guardServerKey(): Promise<Response | null> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.email ?? session?.user?.name ?? '';
  if (!userId) {
    return jsonResponse({ error: 'Sign in, or provide your own API key' }, 401);
  }

  let by: string;
  try {
    by = hashUserId(userId);
  } catch {
    return jsonResponse({ error: 'AI reports unavailable' }, 503);
  }

  const verdict = await consumeAiQuota(by, Date.now());
  if (verdict.unavailable) {
    return jsonResponse({ error: 'AI reports unavailable' }, 503);
  }
  if (!verdict.allowed) {
    return jsonResponse({ error: 'Hourly AI report quota reached' }, 429, {
      'Retry-After': String(verdict.retryAfterSeconds),
    });
  }

  return null;
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
    const headerKey = req.headers.get('x-ai-key')?.trim() ?? '';
    const providerName = req.headers.get('x-ai-provider') ?? 'claude';

    if (!isProviderName(providerName)) {
      return jsonResponse({ error: `Unknown AI provider — expected ${PROVIDERS.join(', ')}` }, 400);
    }

    // BYOK d'abord : qui fournit sa clé paie avec elle. La clé serveur n'est qu'un secours.
    const apiKey = headerKey || envKeyFor(providerName);

    if (!apiKey) {
      return jsonResponse(
        { error: 'API key required — enter one in the UI or set it in the server environment' },
        401
      );
    }

    const requestedModel = req.headers.get('x-ai-model');
    if (
      providerName === 'groq' &&
      requestedModel &&
      !GROQ_MODELS.some((m) => m.id === requestedModel)
    ) {
      return jsonResponse({ error: 'Unknown Groq model' }, 400);
    }
    const groqModel = (requestedModel ?? DEFAULT_GROQ_MODEL) as GroqModelId;

    const declared = Number(req.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return jsonResponse({ error: 'Payload too large' }, 413);
    }

    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) {
      return jsonResponse({ error: 'Payload too large' }, 413);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return jsonResponse({ error: 'Invalid JSON' }, 400);
    }

    const result = parseAnalysisResult(raw);
    if (!result) {
      return jsonResponse({ error: 'Invalid analysis payload' }, 400);
    }

    // Après validation du corps : un quota se dépense sur une requête qui produira vraiment
    // un rapport, pas sur une qu'on s'apprête à refuser.
    if (!headerKey) {
      const refusal = await guardServerKey();
      if (refusal) return refusal;
    }

    const provider =
      providerName === 'gemini'
        ? new GeminiProvider(apiKey)
        : providerName === 'groq'
          ? new GroqProvider(apiKey, groqModel)
          : new ClaudeProvider(apiKey);

    const talentNodes = getTalentNodes(result.input.specId);
    const prompt = buildAnalysisPrompt(result, talentNodes);

    // Avant le flux, et attendue : ce qui part sans être enregistré ne se rattrape pas, et un
    // retour de lecteur arrivant sur un rendu sans empreinte ne dirait plus de quel conseil
    // il parle. L'appel ne jette jamais — le rapport ne dépend pas de sa capture.
    const boss = result.bosses.find((b) => b !== null);
    if (boss) {
      await recordAdvice(boss, {
        provider: providerName,
        model: providerName === 'groq' ? groqModel : null,
      });
    }

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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonResponse({ error: message }, 500);
  }
}
