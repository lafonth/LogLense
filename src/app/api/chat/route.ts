import type { Provider } from '@/lib/ai/catalog';
import type { ChatPromotion, ChatToolLog } from '@/lib/ai/chat-tools';
import type { AIStreamChunk, ChatTurn, ToolCapableProvider, UsageData } from '@/lib/ai/provider';
import type { PromotionSubject } from '@/lib/wcl/promote';
import type { BossResult, ReferenceSample, SnapshotRef, TopPlayer } from '@/types';
import { getServerSession } from 'next-auth/next';
import { CHAT_PROVIDERS, envKeyFor, isChatProvider, servableProviders } from '@/lib/ai/catalog';

import { runChatLoop } from '@/lib/ai/chat-loop';
import { buildChatSystemPrompt } from '@/lib/ai/chat-prompt';
import { subjectKillTimeMs } from '@/lib/ai/chat-tools';
import { ClaudeProvider } from '@/lib/ai/claude';
import { GeminiProvider } from '@/lib/ai/gemini';
import { OpenAIProvider } from '@/lib/ai/openai';
import { guardAiSpend } from '@/lib/api/ai-guard';
import { logRouteError } from '@/lib/api/log-error';
import { isNum, isRecord, isStr } from '@/lib/api/parse';
import { guardWclSpend, PROMOTION_UNITS } from '@/lib/api/wcl-guard';
import { authOptions } from '@/lib/auth';
import { recordChat } from '@/lib/labels/record-chat';
import { recordUsage } from '@/lib/labels/record-usage';
import { getTalentNodes } from '@/lib/talent-loader';
import { getWCLToken } from '@/lib/wcl/auth';
import { promoteReference } from '@/lib/wcl/promote';
import { readSnapshot, snapshotKey } from '@/lib/wcl/result-snapshot';

export const runtime = 'nodejs';

/**
 * Le chat d'une analyse : le modèle relit l'instantané du `BossResult` et répond aux questions
 * du joueur, en rejouant sa cohorte à la demande.
 *
 * Deux propriétés distinguent cette route de `/api/ai-report`, et aucune n'est négociable.
 *
 * **La session est exigée avant tout le reste.** Elle l'a toujours été ici, y compris du temps
 * où une clé personnelle dispensait le rapport de compte : le corps du rapport portait déjà son
 * analyse, celui-ci ne porte qu'une désignation, et la réponse tient à une lecture d'instantané
 * — donc à une analyse dérivée de Warcraft Logs. C'est §2a des CGU : ce que
 * `guardMeteredWclSpend` garantit ailleurs par sa réservation, on le tient ici par le 401.
 * Depuis le retrait du BYOK, le rapport exige la même chose, et pour une raison de plus : il n'y
 * a plus d'autre clé que la nôtre.
 *
 * **Le client désigne l'instantané, il ne le nomme pas.** Le corps porte les champs du
 * pipeline — royaume, personnage, rencontre — et la clé Redis se reforme ici. Accepter une clé
 * toute faite laisserait lire n'importe quelle entrée du cache, celle d'un autre joueur
 * comprise.
 *
 * **Le fournisseur se choisit, sans être libre.** La boucle passe par `streamTurn`, que
 * `ToolCapableProvider` impose : Claude, Gemini et OpenAI le servent, Groq non. La liste
 * admissible se dérive de `CHAT_PROVIDERS`, et un nom hors liste est refusé en 400 — le laisser
 * retomber en silence sur Claude ferait payer notre clé pour un fournisseur que l'utilisateur
 * croyait avoir choisi.
 */

/**
 * Plafond du corps. Très en dessous de celui du rapport : ce corps ne porte pas d'analyse,
 * seulement une désignation d'instantané et l'historique de la conversation.
 */
const MAX_BODY_BYTES = 64_000;

/** Tours conservés dans l'historique. Au-delà, la conversation coûte plus qu'elle n'apprend. */
const MAX_MESSAGES = 24;

/** Longueur d'une question. Ce qui dépasse est un collage de log, pas une question. */
const MAX_MESSAGE_LENGTH = 2_000;

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

interface ChatBody {
  snapshot: SnapshotRef;
  /**
   * L'historique, dernier message utilisateur compris. Les tours d'outils n'y figurent pas :
   * le client ne les voit pas, et les lui faire porter reviendrait à laisser un appelant
   * fabriquer des résultats d'outil. Chaque requête rejoue donc la conversation sans ses
   * outils — le modèle relit ce qu'il a dit, pas ce qu'il a lu pour le dire.
   */
  messages: { role: 'user' | 'assistant'; text: string }[];
}

function parseSnapshotRef(raw: unknown): SnapshotRef | null {
  if (!isRecord(raw)) return null;

  if (raw.kind === 'character') {
    const { region, serverSlug, characterName, encounterId, difficulty, specId } = raw;
    if (!isStr(region) || !isStr(serverSlug) || !isStr(characterName)) return null;
    if (!isNum(encounterId) || !isNum(difficulty) || !isNum(specId)) return null;

    const ref: SnapshotRef = {
      kind: 'character',
      region,
      serverSlug,
      characterName,
      encounterId,
      difficulty,
      specId,
    };
    if (isNum(raw.specIdOverride)) ref.specIdOverride = raw.specIdOverride;
    if (isRecord(raw.fightOverride)) {
      const { code, fightID } = raw.fightOverride;
      if (!isStr(code) || !isNum(fightID)) return null;
      ref.fightOverride = { code, fightID };
    }
    return ref;
  }

  if (raw.kind === 'report') {
    const { code, actorId, encounterId, fightId, difficulty } = raw;
    if (!isStr(code)) return null;
    if (!isNum(actorId) || !isNum(encounterId) || !isNum(fightId) || !isNum(difficulty)) {
      return null;
    }
    return { kind: 'report', code, actorId, encounterId, fightId, difficulty };
  }

  return null;
}

function parseBody(raw: unknown): ChatBody | null {
  if (!isRecord(raw)) return null;

  const snapshot = parseSnapshotRef(raw.snapshot);
  if (!snapshot) return null;

  const { messages } = raw;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return null;
  }

  const parsed: ChatBody['messages'] = [];
  for (const message of messages) {
    if (!isRecord(message) || !isStr(message.text)) return null;
    if (message.text.length === 0 || message.text.length > MAX_MESSAGE_LENGTH) return null;
    if (message.role !== 'user' && message.role !== 'assistant') return null;
    parsed.push({ role: message.role, text: message.text });
  }

  // La conversation se termine sur une question, sinon il n'y a rien à répondre.
  if (parsed[parsed.length - 1].role !== 'user') return null;

  return { snapshot, messages: parsed };
}

/**
 * La promotion d'un candidat, telle que le chat peut la demander : garde de budget d'abord,
 * jeton et requêtes ensuite.
 *
 * Le garde rend une `Response` de refus, que l'outil ne peut pas rendre à l'utilisateur — il
 * répond au modèle, pas au client. Le statut est donc traduit en motif : 401, 503 et 429 sont
 * les trois issues de `guardWclSpend`, et le modèle sait dire chacune.
 */
function makePromoter(boss: BossResult): (sample: ReferenceSample) => Promise<ChatPromotion> {
  const clientId = process.env.WCL_CLIENT_ID;
  const clientSecret = process.env.WCL_CLIENT_SECRET;

  const subject: PromotionSubject = {
    ilvl: boss.character.stats.avgIlvl,
    killTimeMs: subjectKillTimeMs(boss),
    eligibility: boss.character.eligibility,
  };

  return async (sample) => {
    if (!clientId || !clientSecret) return { ok: false, reason: 'unavailable' };

    const refusal = await guardWclSpend('promote-reference', PROMOTION_UNITS);
    if (refusal) {
      if (refusal.status === 401) return { ok: false, reason: 'unauthorized' };
      if (refusal.status === 429) return { ok: false, reason: 'quota' };
      return { ok: false, reason: 'unavailable' };
    }

    try {
      const token = await getWCLToken(clientId, clientSecret);
      return await promoteReference(token, sample, subject);
    } catch (error) {
      // Le seul échec du chat qui réponde 200 : le modèle reçoit `failed` et l'explique au
      // joueur, mais la panne d'en face — jeton, Warcraft Logs, cache — ne laissait rien.
      logRouteError('chat/promote', error);
      // Le quota reste débité : la réservation est prise avant de savoir si l'appel aboutit, et
      // un plafond qu'un échec rembourse se laisse sonder gratuitement.
      return { ok: false, reason: 'failed' };
    }
  };
}

/**
 * Le fournisseur, à partir d'un nom déjà validé.
 *
 * Le type de retour est `ToolCapableProvider` : ajouter ici un fournisseur qui n'implémente pas
 * `streamTurn` ne compile pas. C'est la même garantie que celle de la boucle, portée au seul
 * endroit qui construit l'objet.
 */
function makeProvider(name: Provider, apiKey: string): ToolCapableProvider {
  if (name === 'gemini') return new GeminiProvider(apiKey);
  if (name === 'openai') return new OpenAIProvider(apiKey);
  return new ClaudeProvider(apiKey);
}

/**
 * Les fournisseurs que le chat peut réellement servir.
 *
 * Séparé du `GET` de `/api/ai-report` : celui-là répond pour le rapport, qui accepte Groq. Les
 * lire au même endroit ferait proposer dans le chat un fournisseur que la route refuse en 400.
 */
export async function GET() {
  return jsonResponse({ providers: servableProviders(CHAT_PROVIDERS) });
}

export async function POST(req: Request) {
  try {
    // Avant tout le reste, et sans exception BYOK : lire un instantané exige une session.
    const session = await getServerSession(authOptions);
    const userId = session?.user?.email ?? session?.user?.name ?? '';
    if (!userId) return jsonResponse({ error: 'Sign in to use the chat' }, 401);

    const servable = servableProviders(CHAT_PROVIDERS);
    if (servable.length === 0) {
      return jsonResponse({ error: 'Chat unavailable' }, 503);
    }

    const requested = req.headers.get('x-ai-provider')?.trim() || servable[0];
    if (!isChatProvider(requested) || !servable.includes(requested)) {
      return jsonResponse(
        { error: `Unsupported chat provider — expected ${servable.join(', ')}` },
        400
      );
    }
    const providerName: Provider = requested;

    // Non vide par construction : `servableProviders` ne retient que ceux qui ont une clé.
    const apiKey = envKeyFor(providerName);

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

    const body = parseBody(raw);
    if (!body) return jsonResponse({ error: 'Invalid chat payload' }, 400);

    const boss = await readSnapshot(snapshotKey(body.snapshot));
    // 410 et non 404 : l'analyse a existé, sa copie de travail a expiré. Le client sait alors
    // qu'il doit la relancer, pas qu'il s'est trompé d'adresse.
    if (!boss) {
      return jsonResponse(
        { error: 'This analysis has expired — run it again to chat about it' },
        410
      );
    }

    // Après validation et après l'instantané : un quota se dépense sur une requête qui produira
    // vraiment une réponse. Plus aucune voie ne l'évite depuis le retrait du BYOK.
    const refusal = await guardAiSpend(userId, 'Chat');
    if (refusal) return refusal;

    const provider = makeProvider(providerName, apiKey);
    const systemPrompt = buildChatSystemPrompt(boss, getTalentNodes(boss.specId));

    const history: ChatTurn[] = body.messages.map((m) =>
      m.role === 'user'
        ? { role: 'user', text: m.text }
        : { role: 'assistant', text: m.text, toolCalls: [] }
    );

    // Vide à chaque requête : les promotions ne survivent pas au tour. Une conversation qui en
    // redemande une la repaie — trois requêtes, annoncées, et le cache de dégâts la sert
    // gratuitement dans le cas courant. C'est le prix d'une route sans état de session, et il
    // se paie du bon côté : rien à faire expirer, rien à invalider.
    const promoted: TopPlayer[] = [];
    const logs: ChatToolLog[] = [];

    const chunks = runChatLoop({
      provider,
      systemPrompt,
      history,
      context: { boss, promoted, promote: makePromoter(boss) },
      onLog: (log) => logs.push(log),
    });

    const turn = body.messages.filter((m) => m.role === 'user').length;

    const encoder = new TextEncoder();
    // Retenu au passage plutôt que relu du navigateur. `runChatLoop` a déjà cumulé les quatre
    // ou cinq appels au modèle d'un tour outillé en un seul relevé : ce qui traverse ici est le
    // coût du tour entier, pas celui de son dernier appel.
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

        // Après le tour, et non avant comme l'empreinte du rapport : ce qui est capturé ici est
        // ce que le modèle a fait des données, ce qui ne se sait qu'une fois les outils passés.
        // Attendue à l'intérieur du `flush` — la fonction vit tant que le flux n'est pas clos,
        // donc c'est le dernier instant où une écriture est encore sûre de partir.
        await recordChat(boss, {
          provider: providerName,
          model: null,
          turn,
          logs,
        });

        // Second enregistrement, joint au premier par `renderId` : le compte de jetons n'existe
        // qu'ici, et il ne dépense pas de quota — son frère vient d'en dépenser un pour le même
        // rendu.
        await recordUsage(boss.renderId, {
          surface: 'chat',
          turn,
          // Toujours vrai depuis le retrait du BYOK — voir le champ dans `usage.ts`.
          serverKey: true,
          provider: providerName,
          usage,
        });
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
  } catch (e) {
    logRouteError('chat', e);
    return jsonResponse({ error: e instanceof Error ? e.message : 'Chat failed' }, 500);
  }
}
