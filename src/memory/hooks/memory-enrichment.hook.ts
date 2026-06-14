import type { IMemory } from '../memory.interface.js'

const MAX_CONTEXT_CHARS = 2000 // ~500 tokens — prevent context overload

/**
 * Enriches agent invocations with relevant context from long-term and graph memory.
 * Includes context window management to avoid injecting too much irrelevant context.
 */
export class MemoryEnrichmentHook {
  constructor(
    private readonly longTerm: IMemory,
    private readonly graph: IMemory,
    private readonly k: number = 3,
    private readonly maxContextChars: number = MAX_CONTEXT_CHARS,
  ) {}

  async enrich(query: string): Promise<string> {
    const [ltResults, graphResults] = await Promise.all([
      this.longTerm.retrieve(query, { k: this.k }).catch(() => []),
      this.graph.retrieve(query, { k: this.k }).catch(() => []),
    ])

    const parts: string[] = []
    let totalChars = 0

    if (ltResults.length > 0) {
      parts.push('## Contexto de sesiones anteriores')
      for (const e of ltResults) {
        const line = `- ${e.content.slice(0, 300)}`
        if (totalChars + line.length > this.maxContextChars) break
        parts.push(line)
        totalChars += line.length
      }
    }

    if (graphResults.length > 0 && totalChars < this.maxContextChars) {
      parts.push('## Entidades relacionadas (graph)')
      for (const e of graphResults) {
        const line = `- ${e.content.slice(0, 200)}`
        if (totalChars + line.length > this.maxContextChars) break
        parts.push(line)
        totalChars += line.length
      }
    }

    if (parts.length <= 1) return query // only header, no actual context

    return `${parts.join('\n')}\n\n---\n\n${query}`
  }
}
