import type { MemoryEntry, MemoryType, RetrieveOptions } from '../types/index.js'
import type { IMemory } from './memory.interface.js'

export interface CompositeMemoryConfig {
  shortTerm?: IMemory
  longTerm?: IMemory
  graph?: IMemory
  custom?: IMemory
}

export class CompositeMemory implements IMemory {
  private strategies: Map<MemoryType, IMemory> = new Map()
  private all: IMemory[] = []

  constructor(config: CompositeMemoryConfig) {
    if (config.shortTerm) {
      this.strategies.set('episodic', config.shortTerm)
      this.all.push(config.shortTerm)
    }
    if (config.longTerm) {
      this.strategies.set('semantic', config.longTerm)
      this.all.push(config.longTerm)
    }
    if (config.graph) {
      this.strategies.set('graph-node', config.graph)
      this.all.push(config.graph)
    }
    if (config.custom) {
      this.strategies.set('preference', config.custom)
      this.all.push(config.custom)
    }
  }

  async store(entry: Omit<MemoryEntry, 'id' | 'timestamp'>): Promise<MemoryEntry> {
    const strategy = this.strategies.get(entry.type)
    if (!strategy) throw new Error(`No strategy registered for memory type: ${entry.type}`)
    return strategy.store(entry)
  }

  async retrieve(query: string, options?: RetrieveOptions): Promise<MemoryEntry[]> {
    if (options?.type) {
      const strategy = this.strategies.get(options.type)
      return strategy ? strategy.retrieve(query, options) : []
    }
    // query all strategies in parallel with weight-based ranking
    const weightedResults = await Promise.all(
      this.all.map(async (s, idx) => {
        const results = await s.retrieve(query, options).catch(() => [] as MemoryEntry[])
        // Weight: long-term (semantic/embeddings) > graph > short-term > custom
        const weights = [0.7, 1.0, 0.8, 0.5] // shortTerm, longTerm, graph, custom
        const weight = weights[idx] ?? 0.5
        return results.map((entry, rank) => ({
          entry,
          // Score: higher weight + higher position = better
          score: weight * (1 - rank / Math.max(results.length, 1)),
        }))
      })
    )
    const flat = weightedResults.flat()
    // deduplicate by id, sort by score, limit to k
    const seen = new Set<string>()
    const deduped = flat
      .sort((a, b) => b.score - a.score)
      .filter((item) => {
        if (seen.has(item.entry.id)) return false
        seen.add(item.entry.id)
        return true
      })
    return deduped.slice(0, options?.k ?? 10).map((item) => item.entry)
  }

  async forget(id: string): Promise<void> {
    await Promise.all(this.all.map((s) => s.forget(id).catch(() => {})))
  }

  async clear(): Promise<void> {
    await Promise.all(this.all.map((s) => s.clear()))
  }

  async getAll(): Promise<MemoryEntry[]> {
    const results = await Promise.all(this.all.map((s) => s.getAll().catch(() => [] as MemoryEntry[])))
    return results.flat()
  }
}
