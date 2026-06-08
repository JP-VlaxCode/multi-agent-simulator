import { v4 as uuidv4 } from 'uuid'
import type { MemoryEntry, RetrieveOptions } from '../types/index.js'
import type { IMemory } from './memory.interface.js'

export class ShortTermMemory implements IMemory {
  private entries: MemoryEntry[] = []

  constructor(private readonly maxEntries: number = 50) {}

  async store(entry: Omit<MemoryEntry, 'id' | 'timestamp'>): Promise<MemoryEntry> {
    const full: MemoryEntry = {
      ...entry,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
    }
    this.entries.push(full)
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries)
    }
    return full
  }

  async retrieve(query: string, options?: RetrieveOptions): Promise<MemoryEntry[]> {
    const k = options?.k ?? 5
    let results = this.entries
    if (options?.type) results = results.filter((e) => e.type === options.type)
    // simple substring match
    const q = query.toLowerCase()
    const scored = results.map((e) => ({
      entry: e,
      score: e.content.toLowerCase().includes(q) ? 1 : 0,
    }))
    return scored
      .filter((s) => s.score > 0)
      .slice(-k)
      .map((s) => s.entry)
  }

  async forget(id: string): Promise<void> {
    this.entries = this.entries.filter((e) => e.id !== id)
  }

  async clear(): Promise<void> {
    this.entries = []
  }

  async getAll(): Promise<MemoryEntry[]> {
    return [...this.entries]
  }
}
