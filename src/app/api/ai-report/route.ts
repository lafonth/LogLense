import type { Provider } from '@/lib/ai/catalog';
import type { GroqModelId } from '@/lib/ai/groq';
import type { AIProvider, AIStreamChunk, UsageData } from '@/lib/ai/provider';
import type { AnalysisResult } from '@/types';
import { getServerSession } from 'next-auth/next';
import { envKeyFor, isProvider, PROVIDERS } from '@/lib/ai/catalog';

import { ClaudeProvider } from '@/lib/ai/claude';
import { GeminiProvider } from '@/lib/ai/gemini';
import { DEFAULT_GROQ_MODEL, GROQ_MODELS, GroqProvider } from '@/lib/ai/groq';
import { OpenAIProvider } from '@/lib/ai/openai';
import { buildAnalysisPrompt, SYSTEM_PROMPT } from '@/lib/ai/prompt';
import { logRouteError } from '@/lib/api/log-error';
import { authOptions } from '@/lib/auth';
import { isBossResult } from '@/lib/boss-outcome';
import { hashUserId } from '@/lib/labels/identity';
import { consumeAiQuota } from '@/lib/labels/rate-limit';
import { recordAdvice } from '@/lib/labels/record-advice';
import { recordUsage } from '@/lib/labels/record-usage';
import { getTalentNodes } from '@/lib/talent-loader';

export const runtime = 'nodejs';

/*
 * Les fournisseurs acceptés viennent du catalogue, et la liste reste fermée : un nom inconnu
 * retombait silencieusement sur Claude, donc sur la clé serveur, et un en-tête mal orthographié
 * suffisait à faire payer l'hôte. Le rapport les prend tous, y compris Groq — il n'appelle pas
 * d'outil, donc rien n'y exige `streamTurn`.
 */

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

/** Le fournisseur, à partir d'un nom déjà validé. Seul Groq lit le modèle demandé. */
function makeProvider(name: Provider, apiKey: string, groqModel: GroqModelId): AIProvider {
  if (name === 'gemini') return new GeminiProvider(apiKey);
  if (name === 'groq') return new GroqProvider(apiKey, groqModel);
  if (name === 'openai') return new OpenAIProvider(apiKey);
  return new ClaudeProvider(apiKey);
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
  const configured = PROVIDERS.filter((p) => envKeyFor(p.id)).map((p) => p.id);
  return jsonResponse({ configuredProviders: configured });
}

export async function POST(req: Request) {
  try {
    const headerKey = req.headers.get('x-ai-key')?.trim() ?? '';
    const providerName = req.headers.get('x-ai-provider') ?? 'claude';

    if (!isProvider(providerName)) {
      const names = PROVIDERS.map((p) => p.id).join(', ');
      return jsonResponse({ error: `Unknown AI provider — expected ${names}` }, 400);
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

    const provider = makeProvider(providerName, apiKey, groqModel);

    const talentNodes = getTalentNodes(result.input.specId);
    const prompt = buildAnalysisPrompt(result, talentNodes);

    // Avant le flux, et attendue : ce qui part sans être enregistré ne se rattrape pas, et un
    // retour de lecteur arrivant sur un rendu sans empreinte ne dirait plus de quel conseil
    // il parle. L'appel ne jette jamais — le rapport ne dépend pas de sa capture.
    // Le premier résultat, jamais un refus : c'est lui qui porte le `renderId` auquel
    // l'empreinte du conseil et le relevé de jetons se rattachent.
    const boss = result.bosses.find(isBossResult);
    if (boss) {
      await recordAdvice(boss, {
        provider: providerName,
        model: providerName === 'groq' ? groqModel : null,
      });
    }

    const chunks = provider.stream(prompt, SYSTEM_PROMPT);

    const encoder = new TextEncoder();
    // Retenu au passage plutôt que relu du navigateur : le relevé traverse déjà ce flux pour
    // alimenter la jauge de contexte, et c'est le seul endroit du serveur qui le voie.
    let usage: UsageData | null = null;

    const sseStream = new TransformStream<AIStreamChunk, Uint8Array>({
      transform(chunk, controller) {
        if (chunk.type === 'text') {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk.content)}\n\n`));
        } else {
          usage = chunk.data;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ _meta: 'usage', ...chunk.data })}\n\n`)
          );
        }
      },
      async flush(controller) {
        controller.enqueue(encoder.encode('data: "[DONE]"\n\n'));

        // Après le flux, contrairement à l'empreinte du conseil : les jetons n'existent qu'une
        // fois le fournisseur allé au bout. Deux enregistrements joints par `renderId` plutôt
        // qu'un seul déplacé — l'empreinte doit partir avant, le compte ne le peut pas.
        // Attendue à l'intérieur du `flush` : c'est le dernier instant où une écriture est
        // encore sûre de partir.
        if (boss) {
          await recordUsage(boss.renderId, {
            surface: 'report',
            turn: null,
            serverKey: !headerKey,
            provider: providerName,
            usage,
          });
        }
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
    logRouteError('ai-report', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonResponse({ error: message }, 500);
  }
}
