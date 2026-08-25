export interface UsageData {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
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

/** Ce qu'un outil rend au modèle, en texte. Rattaché à l'appel par son identifiant. */
export interface ToolResult {
  id: string;
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
 * Séparé de {@link AIProvider} parce que le support des outils est inégal : Groq et Gemini
 * implémentent `stream`, pas ceci. La boucle de chat exige donc ce type, et le refus se lit
 * à la compilation plutôt qu'au premier appel d'outil ignoré.
 */
export interface ToolCapableProvider extends AIProvider {
  streamTurn: (
    turns: ChatTurn[],
    systemPrompt: string,
    tools: ToolSpec[]
  ) => ReadableStream<AIChatChunk>;
}
