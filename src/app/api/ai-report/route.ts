import type { Provider } from '@/lib/ai/catalog';
import type { GroqModelId } from '@/lib/ai/groq';
import type { AIProvider, AIStreamChunk, UsageData } from '@/lib/ai/provider';
import type { AnalysisResult } from '@/types';
import { getServerSession } from 'next-auth/next';
import { envKeyFor, isProvider, servableProviders } from '@/lib/ai/catalog';

import { ClaudeProvider } from '@/lib/ai/claude';
import { GeminiProvider } from '@/lib/ai/gemini';
import { DEFAULT_GROQ_MODEL, GROQ_MODELS, GroqProvider } from '@/lib/ai/groq';
import { OpenAIProvider } from '@/lib/ai/openai';
import { buildAnalysisPrompt, SYSTEM_PROMPT } from '@/lib/ai/prompt';
import { guardAiSpend } from '@/lib/api/ai-guard';
import { logRouteError } from '@/lib/api/log-error';
import { authOptions } from '@/lib/auth';
import { isBossResult } from '@/lib/boss-outcome';
import { recordAdvice } from '@/lib/labels/record-advice';
import { recordUsage } from '@/lib/labels/record-usage';
import { getTalentNodes } from '@/lib/talent-loader';

export const runtime = 'nodejs';

/*
 * Les fournisseurs acceptés viennent du catalogue, et la liste reste doublement fermée : offerts
 * par le déploiement, et munis d'une clé. Un nom inconnu retombait autrefois silencieusement sur
 * Claude, et un en-tête mal orthographié suffisait à faire payer l'hôte. Le rapport prend tous
 * ceux qui sont offerts, Groq compris — il n'appelle pas d'outil, donc rien n'y exige
 * `streamTurn`.
 *
 * La clé est la nôtre, toujours : l'en-tête `x-ai-key` n'existe plus. Ce que le produit dit de
 * la rotation d'un joueur engage le produit, et il ne peut pas l'engager sur un modèle choisi
 * par l'utilisateur. Conséquence directe : plus rien ne contourne le quota — la voie BYOK
 * sautait `guardServerKey`, donc le plafond horaire, ce qui était cohérent tant qu'elle payait
 * sa propre facture.
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
 * Les fournisseurs que le rapport peut réellement servir.
 *
 * Le client rend ce que cette réponse contient plutôt que le catalogue : sans clé personnelle,
 * proposer un fournisseur dont le serveur n'a pas la clé, c'est proposer un 401.
 */
export async function GET() {
  return jsonResponse({ providers: servableProviders() });
}

export async function POST(req: Request) {
  try {
    // Avant tout le reste : une génération se facture, elle exige donc un compte.
    const session = await getServerSession(authOptions);
    const userId = session?.user?.email ?? session?.user?.name ?? '';
    if (!userId) return jsonResponse({ error: 'Sign in to generate an AI report' }, 401);

    const servable = servableProviders();
    if (servable.length === 0) {
      return jsonResponse({ error: 'AI reports unavailable' }, 503);
    }

    const requested = req.headers.get('x-ai-provider')?.trim() || servable[0];
    if (!isProvider(requested) || !servable.includes(requested)) {
      return jsonResponse(
        { error: `Unsupported AI provider — expected ${servable.join(', ')}` },
        400
      );
    }
    const providerName: Provider = requested;

    // Non vide par construction : `servableProviders` ne retient que ceux qui ont une clé.
    const apiKey = envKeyFor(providerName);

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
    const refusal = await guardAiSpend(userId, 'AI reports');
    if (refusal) return refusal;

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
            // Toujours vrai depuis le retrait du BYOK. Le champ reste : le corpus porte des
            // enregistrements antérieurs où il est faux, et les additionner sans lui ferait
            // passer notre budget d'inférence pour plus qu'il n'était.
            serverKey: true,
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
