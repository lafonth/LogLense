export interface UsageData {
  /** Entrée facturée, cache compris. C'est ce que la jauge de contexte affiche. */
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /**
   * Part de `promptTokens` relue depuis le cache du fournisseur, facturée un dixième du tarif
   * d'entrée.
   *
   * Séparée parce que sans elle aucun euro ne se calcule : un tour de chat outillé relit le
   * même contexte de boss à chaque tour d'outil, et le compter plein ferait passer une
   * conversation ordinaire pour une conversation ruineuse.
   *
   * `null` dit **non mesuré**, pas nul. Claude, Gemini et OpenAI rendent ce terme ; Groq n'en
   * rend aucun, et un zéro chez lui se lirait à tort comme un cache qui n'a jamais pris.
   */
  cachedTokens: number | null;
  /**
   * Part de `promptTokens` écrite dans le cache, facturée un quart de plus que l'entrée.
   * Même convention de `null` que {@link UsageData.cachedTokens}.
   *
   * Seul Claude a ce terme : Gemini et OpenAI cachent d'office et ne facturent pas l'écriture,
   * il n'y a donc rien à mesurer chez eux — ce qui est différent d'avoir mesuré zéro.
   */
  cacheWriteTokens: number | null;
  model: string;
  contextWindow: number;
}

export type AIStreamChunk = { type: 'text'; content: string } | { type: 'usage'; data: UsageData };

export interface AIProvider {
  stream: (prompt: string, systemPrompt: string) => ReadableStream<AIStreamChunk>;
}

/**
 * L'outil tel qu'il est déclaré au modèle. `inputSchema` est un JSON Schema d'objet — la
 * seule forme que les trois familles de modèles acceptent en commun.
 */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Un appel d'outil demandé par le modèle. `input` reste brut : c'est l'outil qui valide. */
export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

/**
 * Ce qu'un outil rend au modèle, en texte. Rattaché à l'appel par son identifiant.
 *
 * `name` double l'identifiant parce que toutes les familles ne rattachent pas de la même
 * façon : Anthropic et OpenAI renvoient l'identifiant de l'appel, Gemini ne connaît qu'un
 * nom de fonction. Le porter ici évite de le déduire d'un identifiant fabriqué — un nom
 * d'outil reconstruit par découpage de chaîne casse au premier outil renommé.
 */
export interface ToolResult {
  id: string;
  name: string;
  content: string;
}

/**
 * Un tour de conversation. Le tour assistant porte **à la fois** son texte et ses appels
 * d'outil : les renvoyer séparément ferait perdre l'ordre, et un `tool_result` sans son
 * `tool_use` est refusé par l'API.
 */
export type ChatTurn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string; toolCalls: ToolCall[] }
  | { role: 'tool'; results: ToolResult[] };

/**
 * Ce qui sort d'un tour de chat. Sur-ensemble strict de {@link AIStreamChunk} : le rapport
 * mono-tour et ses trois consommateurs ne bougent pas, et une boucle agentique lit en plus
 * les appels d'outil.
 */
export type AIChatChunk = AIStreamChunk | { type: 'tool_call'; call: ToolCall };

/**
 * Un fournisseur capable de multi-tour outillé.
 *
 * Séparé de {@link AIProvider} parce que le support des outils est inégal : Claude, Gemini et
 * OpenAI l'implémentent, Groq n'implémente que `stream` — les modèles servis là-bas rendent des
 * appels d'outil trop irréguliers pour une boucle qui dépense chez Warcraft Logs. La boucle de
 * chat exige donc ce type, et le refus se lit à la compilation plutôt qu'au premier appel
 * d'outil ignoré.
 */
export interface ToolCapableProvider extends AIProvider {
  streamTurn: (
    turns: ChatTurn[],
    systemPrompt: string,
    tools: ToolSpec[]
  ) => ReadableStream<AIChatChunk>;
}
