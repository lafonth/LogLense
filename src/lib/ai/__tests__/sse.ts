import type { AIChatChunk, AIStreamChunk, ToolCall } from '../provider';

/**
 * Une réponse HTTP dont le corps est un flux SSE, découpé où l'on veut.
 *
 * La découpe est le point : les deux fournisseurs assemblent les lignes eux-mêmes, et une
 * ligne coupée en deux paquets est le cas que le tampon interne est censé rattraper.
 */
export function sseResponse(packets: string[], init: { ok?: boolean; status?: number } = {}) {
  const encoder = new TextEncoder();
  let index = 0;

  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    text: () => Promise.resolve(packets.join('')),
    body: {
      getReader: () => ({
        read: () =>
          Promise.resolve(
            index < packets.length
              ? { value: encoder.encode(packets[index++]), done: false }
              : { value: undefined, done: true }
          ),
      }),
    },
  } as unknown as Response;
}

export async function drain(stream: ReadableStream<AIStreamChunk>) {
  const reader = stream.getReader();
  const chunks: AIStreamChunk[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return {
    text: chunks
      .filter((c) => c.type === 'text')
      .map((c) => (c as { type: 'text'; content: string }).content)
      .join(''),
    usage: chunks.find((c) => c.type === 'usage') as
      | { type: 'usage'; data: Record<string, unknown> }
      | undefined,
  };
}

/**
 * Comme {@link drain}, mais pour un tour de chat : les appels d'outil sont ce qu'on vient
 * vérifier, et `drain` les jetterait avec le reste de ce qui n'est ni texte ni usage.
 */
export async function drainChat(stream: ReadableStream<AIChatChunk>) {
  const reader = stream.getReader();
  const chunks: AIChatChunk[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return {
    text: chunks
      .filter((c) => c.type === 'text')
      .map((c) => (c as { type: 'text'; content: string }).content)
      .join(''),
    calls: chunks
      .filter((c) => c.type === 'tool_call')
      .map((c) => (c as { type: 'tool_call'; call: ToolCall }).call),
    usage: chunks.find((c) => c.type === 'usage') as
      | { type: 'usage'; data: Record<string, unknown> }
      | undefined,
  };
}
