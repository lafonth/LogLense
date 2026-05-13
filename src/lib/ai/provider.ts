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
