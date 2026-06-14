import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import type { MemoryEntry, RetrieveOptions } from '../types/index.js'
import type { IMemory } from './memory.interface.js'
import { getEmbedding, cosineSimilarity } from './embeddings.js'

export class LongTermMemory implements IMemory {
  private entries: MemoryEntry[] = []
  private loadPromise: Promise<void> | null = null

  constructor(
    private readonly storePath: string = './data/long-term.json',
    private readonly maxEntries: number = 500,
  ) {}

  private async load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise
    this.loadPromise = (async () => {
      try {
        await mkdir('./data', { recursive: true })
        if (existsSync(this.storePath)) {
          const raw = await readFile(this.storePath, 'utf-8')
          this.entries = JSON.parse(raw) as MemoryEntry[]
        }
      } catch {
        this.entries = []
      }
    })()
    return this.loadPromise
  }

  private async persist(): Promise<void> {
    await mkdir('./data', { recursive: true })
    await writeFile(this.storePath, JSON.stringify(this.entries, null, 2), 'utf-8')
  }

  async store(entry: Omit<MemoryEntry, 'id' | 'timestamp'>): Promise<MemoryEntry> {
    await this.load()
    let embedding: number[] | undefined
    try {
      embedding = await getEmbedding(entry.content)
    } catch {
      // embeddings optional; fall back to text search
    }
    const full: MemoryEntry = {
      ...entry,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      embedding,
    }
    this.entries.push(full)
    // Evict oldest entries if over limit
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries)
    }
    await this.persist()
    return full
  }

  async retrieve(query: string, options?: RetrieveOptions): Promise<MemoryEntry[]> {
    await this.load()
    const k = options?.k ?? 5
    let pool = this.entries
    if (options?.type) pool = pool.filter((e) => e.type === options.type)

    let queryEmbedding: number[] | undefined
    try {
      queryEmbedding = await getEmbedding(query)
    } catch {
      // fallback to text match
    }

    const scored = pool.map((e) => {
      let score = 0
      if (queryEmbedding && e.embedding) {
        score = cosineSimilarity(queryEmbedding, e.embedding)
      } else {
        score = e.content.toLowerCase().includes(query.toLowerCase()) ? 0.5 : 0
      }
      return { entry: e, score }
    })

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .filter((s) => s.score > 0)
      .map((s) => s.entry)
  }

  async forget(id: string): Promise<void> {
    await this.load()
    this.entries = this.entries.filter((e) => e.id !== id)
    await this.persist()
  }

  async clear(): Promise<void> {
    this.entries = []
    await this.persist()
  }

  async getAll(): Promise<MemoryEntry[]> {
    await this.load()
    return [...this.entries]
  }
}
