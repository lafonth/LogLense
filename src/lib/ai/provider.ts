export interface AIProvider {
  stream: (prompt: string, systemPrompt: string) => ReadableStream<string>;
}
