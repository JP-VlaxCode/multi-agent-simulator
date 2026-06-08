import type { MemoryEntry, MemoryType, RetrieveOptions } from '../types/index.js'

export interface IMemory {
  store(entry: Omit<MemoryEntry, 'id' | 'timestamp'>): Promise<MemoryEntry>
  retrieve(query: string, options?: RetrieveOptions): Promise<MemoryEntry[]>
  forget(id: string): Promise<void>
  clear(): Promise<void>
  getAll(): Promise<MemoryEntry[]>
}

export type { MemoryEntry, MemoryType, RetrieveOptions }
