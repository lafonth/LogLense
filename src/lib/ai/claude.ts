import type {
  AIChatChunk,
  AIProvider,
  AIStreamChunk,
  ChatTurn,
  ToolCapableProvider,
  ToolSpec,
  UsageData,
} from './provider';
import Anthropic from '@anthropic-ai/sdk';

const CLAUDE_MODEL = 'claude-sonnet-5';
const CLAUDE_CONTEXT_WINDOW = 200000;

/**
 * Fenêtre de sortie d'un tour de chat. Plus courte que celle du rapport : une réponse de
 * chat répond à une question, elle ne rejoue pas l'analyse entière.
 */
const CHAT_MAX_TOKENS = 1200;

/**
 * Les trois termes d'entrée d'Anthropic, relevés séparément parce qu'ils ne sont pas facturés
 * au même tarif : l'entrée neuve au prix plein, l'écriture de cache un quart plus cher, la
 * relecture de cache au dixième. Les additionner avant de les rendre — ce que faisait la
 * version précédente — rendait le coût réel incalculable en aval.
 */
interface Billed {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** Recompose le relevé rendu au reste du produit. `promptTokens` reste la somme des trois. */
function toUsage(b: Billed): UsageData {
  const promptTokens = b.input + b.cacheRead + b.cacheWrite;
  return {
    promptTokens,
    completionTokens: b.output,
    totalTokens: promptTokens + b.output,
    cachedTokens: b.cacheRead,
    cacheWriteTokens: b.cacheWrite,
    model: CLAUDE_MODEL,
    contextWindow: CLAUDE_CONTEXT_WINDOW,
  };
}

/** Un flux qui n'a rien facturé n'a rien à dire — mieux vaut pas de jauge qu'une jauge à zéro. */
function billedSomething(b: Billed): boolean {
  return b.input > 0 || b.output > 0 || b.cacheRead > 0 || b.cacheWrite > 0;
}

/**
 * Le tableau `messages` de l'API, reconstruit depuis l'historique de la boucle.
 *
 * Le dernier bloc porte un **second** point de cache. Celui du prompt système couvre les
 * instructions et les outils, qui sont fixes ; il ne couvre pas la conversation, qui grossit à
 * chaque tour d'outil et repartait donc au prix plein jusqu'à cinq fois dans un seul tour. La
 * borne se déplace à chaque appel : le suivant relit tout ce qui précède au dixième et n'écrit
 * que ce qui vient de s'ajouter. Sous le préfixe minimal d'Anthropic, elle est ignorée sans
 * frais — il n'y a donc pas de seuil à tester ici.
 */
function toMessages(turns: ChatTurn[]): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = turns.map((turn) => {
    if (turn.role === 'user') return { role: 'user' as const, content: turn.text };

    if (turn.role === 'tool') {
      return {
        role: 'user' as const,
        content: turn.results.map((r) => ({
          type: 'tool_result' as const,
          tool_use_id: r.id,
          content: r.content,
        })),
      };
    }

    const blocks: Anthropic.ContentBlockParam[] = [];
    if (turn.text) blocks.push({ type: 'text', text: turn.text });
    for (const call of turn.toolCalls) {
      blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input ?? {} });
    }
    return { role: 'assistant' as const, content: blocks };
  });

  const last = messages[messages.length - 1];
  if (!last) return messages;

  const blocks: Anthropic.ContentBlockParam[] =
    typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : [...last.content];

  const tail = blocks[blocks.length - 1];
  if (!tail) return messages;

  // Le bloc de queue sort toujours de cette fonction meme : texte, `tool_use` ou `tool_result`,
  // et les trois portent `cache_control`. L'union le refuse a cause des blocs `thinking`, que
  // nous n'emettons jamais — d'ou l'assertion, qui ne couvre que ce cas-la.
  //
  // Cinq minutes ici, contrairement au prompt système : ce point de coupure se déplace à chaque
  // appel, et ses relectures sont celles d'une boucle d'outils — quelques secondes. Payer une
  // rétention d'une heure sur un préfixe réécrit au tour suivant serait du double tarif pour
  // rien.
  blocks[blocks.length - 1] = {
    ...tail,
    cache_control: { type: 'ephemeral' },
  } as Anthropic.ContentBlockParam;
  messages[messages.length - 1] = { ...last, content: blocks };

  return messages;
}

export class ClaudeProvider implements AIProvider, ToolCapableProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  stream(prompt: string, systemPrompt: string): ReadableStream<AIStreamChunk> {
    const client = this.client;

    return new ReadableStream<AIStreamChunk>({
      async start(controller) {
        try {
          const stream = client.messages.stream({
            model: CLAUDE_MODEL,
            max_tokens: 1500,
            // Le prompt système est fixe et fait le gros de l'entrée facturée : le mettre en
            // cache est le seul levier de coût qui ne change rien au produit.
            //
            // Une heure et non cinq minutes, le défaut. Ce préfixe-là ne sert pas un tour à
            // l'autre d'une même conversation mais un rapport à l'autre, tous comptes confondus
            // — le cache est celui de la clé, pas celui de l'utilisateur. Avec cinq minutes, un
            // trafic de bêta n'y touche presque jamais deux fois. L'écriture coûte le double du
            // tarif plein au lieu d'un quart en plus, la lecture rescapée en économise neuf
            // dixièmes : il suffit que cinq écritures sur six soient relues une fois pour que le
            // choix soit gagnant, et à ce rythme-là elles le sont toutes.
            system: [
              {
                type: 'text',
                text: systemPrompt,
                cache_control: { type: 'ephemeral', ttl: '1h' },
              },
            ],
            messages: [{ role: 'user', content: prompt }],
          });

          const billed: Billed = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

          for await (const event of stream) {
            if (event.type === 'message_start') {
              // `input_tokens` exclut ce qui est lu ou écrit dans le cache : les trois termes
              // sont relevés à part, et `toUsage` les rassemble pour la jauge de contexte.
              const usage = event.message.usage;
              billed.input = usage.input_tokens;
              billed.cacheWrite = usage.cache_creation_input_tokens ?? 0;
              billed.cacheRead = usage.cache_read_input_tokens ?? 0;
            } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue({ type: 'text', content: event.delta.text });
            } else if (event.type === 'message_delta' && event.usage) {
              billed.output = event.usage.output_tokens;
            }
          }

          if (billedSomething(billed)) {
            controller.enqueue({ type: 'usage', data: toUsage(billed) });
          }
        } catch (e) {
          controller.enqueue({
            type: 'text',
            content: `\n\n[Error: ${e instanceof Error ? e.message : 'Unknown error'}]`,
          });
        }

        controller.close();
      },
    });
  }

  /**
   * Un tour de la boucle de chat : le modèle répond, ou demande des outils.
   *
   * Le texte part au fil de l'eau — c'est ce que l'utilisateur lit — mais les appels d'outil
   * sont pris sur le message final plutôt que reconstitués depuis les `input_json_delta`.
   * Un JSON partiel n'est pas un argument d'outil : le décoder à la main rouvrirait un
   * parseur que le SDK tient déjà, pour rien.
   */
  streamTurn(
    turns: ChatTurn[],
    systemPrompt: string,
    tools: ToolSpec[]
  ): ReadableStream<AIChatChunk> {
    const client = this.client;

    return new ReadableStream<AIChatChunk>({
      async start(controller) {
        try {
          const stream = client.messages.stream({
            model: CLAUDE_MODEL,
            max_tokens: CHAT_MAX_TOKENS,
            // Même raison qu'au rapport, et même heure de rétention : le contexte du boss est
            // fixe pour toute la conversation, et c'est lui qui fait le gros de l'entrée
            // facturée. Ici la relecture est celle d'un tour à l'autre — quelques minutes de
            // rédaction entre deux questions passent la fenêtre de cinq minutes sans mal.
            system: [
              {
                type: 'text',
                text: systemPrompt,
                cache_control: { type: 'ephemeral', ttl: '1h' },
              },
            ],
            tools: tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
            })),
            messages: toMessages(turns),
          });

          const billed: Billed = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

          for await (const event of stream) {
            if (event.type === 'message_start') {
              const usage = event.message.usage;
              billed.input = usage.input_tokens;
              billed.cacheWrite = usage.cache_creation_input_tokens ?? 0;
              billed.cacheRead = usage.cache_read_input_tokens ?? 0;
            } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue({ type: 'text', content: event.delta.text });
            } else if (event.type === 'message_delta' && event.usage) {
              billed.output = event.usage.output_tokens;
            }
          }

          const final = await stream.finalMessage();
          for (const block of final.content) {
            if (block.type === 'tool_use') {
              controller.enqueue({
                type: 'tool_call',
                call: { id: block.id, name: block.name, input: block.input },
              });
            }
          }

          if (billedSomething(billed)) {
            controller.enqueue({ type: 'usage', data: toUsage(billed) });
          }
        } catch (e) {
          controller.enqueue({
            type: 'text',
            content: `

[Error: ${e instanceof Error ? e.message : 'Unknown error'}]`,
          });
        }

        controller.close();
      },
    });
  }
}
