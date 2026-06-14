import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import type { MemoryEntry, RetrieveOptions } from '../types/index.js'
import type { IMemory } from './memory.interface.js'

export class CustomMemory implements IMemory {
  private preferences: MemoryEntry[] = []
  private loadPromise: Promise<void> | null = null

  constructor(private readonly storePath: string = './data/preferences.json') {}

  private async load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise
    this.loadPromise = (async () => {
      try {
        await mkdir('./data', { recursive: true })
        if (existsSync(this.storePath)) {
          const raw = await readFile(this.storePath, 'utf-8')
          this.preferences = JSON.parse(raw) as MemoryEntry[]
        }
      } catch {
        this.preferences = []
      }
    })()
    return this.loadPromise
  }

  private async persist(): Promise<void> {
    await mkdir('./data', { recursive: true })
    await writeFile(this.storePath, JSON.stringify(this.preferences, null, 2), 'utf-8')
  }

  async store(entry: Omit<MemoryEntry, 'id' | 'timestamp'>): Promise<MemoryEntry> {
    await this.load()
    const existing = this.preferences.find(
      (p) => p.metadata.key === entry.metadata.key
    )
    if (existing) {
      existing.content = entry.content
      existing.timestamp = new Date().toISOString()
      await this.persist()
      return existing
    }
    const full: MemoryEntry = {
      ...entry,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
    }
    this.preferences.push(full)
    await this.persist()
    return full
  }

  async retrieve(query: string, options?: RetrieveOptions): Promise<MemoryEntry[]> {
    await this.load()
    const k = options?.k ?? 10
    const q = query.toLowerCase()
    return this.preferences
      .filter((p) => p.content.toLowerCase().includes(q) || String(p.metadata.key ?? '').toLowerCase().includes(q))
      .slice(0, k)
  }

  async forget(id: string): Promise<void> {
    await this.load()
    this.preferences = this.preferences.filter((p) => p.id !== id)
    await this.persist()
  }

  async clear(): Promise<void> {
    this.preferences = []
    await this.persist()
  }

  async getAll(): Promise<MemoryEntry[]> {
    await this.load()
    return [...this.preferences]
  }
}
