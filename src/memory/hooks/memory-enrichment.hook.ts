import type { IMemory } from '../memory.interface.js'

/**
 * Enriches agent invocations with relevant context from long-term and graph memory.
 * Implemented as a plugin factory (returns addHook calls) since BeforeInvocationEvent
 * receives the message string and we prepend retrieved context.
 */
export class MemoryEnrichmentHook {
  constructor(
    private readonly longTerm: IMemory,
    private readonly graph: IMemory,
    private readonly k: number = 3
  ) {}

  async enrich(query: string): Promise<string> {
    const [ltResults, graphResults] = await Promise.all([
      this.longTerm.retrieve(query, { k: this.k }).catch(() => []),
      this.graph.retrieve(query, { k: this.k }).catch(() => []),
    ])

    const parts: string[] = []

    if (ltResults.length > 0) {
      parts.push('## Contexto de sesiones anteriores')
      ltResults.forEach((e) => parts.push(`- ${e.content}`))
    }

    if (graphResults.length > 0) {
      parts.push('## Entidades relacionadas (graph)')
      graphResults.forEach((e) => parts.push(`- ${e.content}`))
    }

    if (parts.length === 0) return query

    return `${parts.join('\n')}\n\n---\n\n${query}`
  }
}
