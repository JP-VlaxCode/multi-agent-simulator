import { QdrantClient } from '@qdrant/js-client-rest'
import { v4 as uuidv4 } from 'uuid'
import type { MemoryEntry, RetrieveOptions } from '../types/index.js'
import type { IMemory } from './memory.interface.js'
import { getEmbedding } from './embeddings.js'
import { getLogger } from '../config/logger.js'

const VECTOR_DIM = 1536 // text-embedding-3-small

export interface QdrantMemoryOptions {
  url: string
  collectionName: string
}

/**
 * Vector store backed by Qdrant.
 * Supports semantic search via embeddings, metadata filtering,
 * and batch operations.
 */
export class QdrantMemory implements IMemory {
  private client: QdrantClient
  private collectionName: string
  private initialized = false

  constructor(options: QdrantMemoryOptions) {
    this.client = new QdrantClient({ url: options.url })
    this.collectionName = options.collectionName
  }

  private async ensureCollection(): Promise<void> {
    if (this.initialized) return
    const log = getLogger().child({ component: 'QdrantMemory' })

    try {
      const collections = await this.client.getCollections()
      const exists = collections.collections.some(c => c.name === this.collectionName)

      if (!exists) {
        await this.client.createCollection(this.collectionName, {
          vectors: { size: VECTOR_DIM, distance: 'Cosine' },
        })
        // Create payload indexes for filtering
        await this.client.createPayloadIndex(this.collectionName, {
          field_name: 'agentId',
          field_schema: 'keyword',
        })
        await this.client.createPayloadIndex(this.collectionName, {
          field_name: 'type',
          field_schema: 'keyword',
        })
        await this.client.createPayloadIndex(this.collectionName, {
          field_name: 'timestamp',
          field_schema: 'keyword',
        })
        log.info({ collection: this.collectionName }, 'Qdrant collection created')
      }
    } catch (err) {
      log.error({ err }, 'Failed to initialize Qdrant collection')
      throw err
    }

    this.initialized = true
  }

  async store(entry: Omit<MemoryEntry, 'id' | 'timestamp'>): Promise<MemoryEntry> {
    await this.ensureCollection()

    const id = uuidv4()
    const timestamp = new Date().toISOString()

    // Chunk long content for better retrieval
    const chunks = this.chunk(entry.content, 500)

    for (let i = 0; i < chunks.length; i++) {
      const chunkId = chunks.length > 1 ? `${id}_chunk${i}` : id
      let embedding: number[]
      try {
        embedding = await getEmbedding(chunks[i])
      } catch {
        // If embeddings fail, store with zero vector (searchable by filter only)
        embedding = new Array(VECTOR_DIM).fill(0)
      }

      await this.client.upsert(this.collectionName, {
        wait: true,
        points: [{
          id: chunkId,
          vector: embedding,
          payload: {
            content: chunks[i],
            fullContent: entry.content,
            type: entry.type,
            timestamp,
            chunkIndex: i,
            totalChunks: chunks.length,
            parentId: id,
            ...this.flattenMetadata(entry.metadata),
          },
        }],
      })
    }

    return { ...entry, id, timestamp }
  }

  async retrieve(query: string, options?: RetrieveOptions): Promise<MemoryEntry[]> {
    await this.ensureCollection()
    const k = options?.k ?? 5

    // ── Hybrid search: vector similarity + keyword fallback ──
    let queryVector: number[] | null = null
    try {
      queryVector = await getEmbedding(query)
    } catch {
      // Vector search unavailable — will use keyword-only
    }

    // Build filter conditions
    const must: Array<Record<string, unknown>> = []

    if (options?.type) {
      must.push({ key: 'type', match: { value: options.type } })
    }

    if (options?.filter) {
      if (options.filter.agentId) {
        must.push({ key: 'agentId', match: { value: options.filter.agentId } })
      }
      if (options.filter.since) {
        must.push({ key: 'timestamp', range: { gte: options.filter.since } })
      }
    }

    let searchResult: Array<{ id: string | number; payload?: Record<string, unknown> | null; score?: number }>

    if (queryVector) {
      // Primary: vector semantic search
      searchResult = await this.client.search(this.collectionName, {
        vector: queryVector,
        limit: k * 2, // over-fetch for dedup
        with_payload: true,
        score_threshold: 0.3,
        ...(must.length > 0 && { filter: { must } }),
      })
    } else {
      // Fallback: keyword scroll with text matching (no vector needed)
      const scrollResult = await this.client.scroll(this.collectionName, {
        limit: k * 3,
        with_payload: true,
        ...(must.length > 0 && { filter: { must } }),
      })
      // Score by keyword match
      const q = query.toLowerCase()
      searchResult = scrollResult.points
        .filter(p => {
          const content = String((p.payload as Record<string, unknown>)?.content ?? '').toLowerCase()
          return content.includes(q) || q.split(' ').some(w => w.length > 3 && content.includes(w))
        })
        .map(p => ({ id: p.id, payload: p.payload as Record<string, unknown>, score: 0.5 }))
    }

    // Deduplicate by parentId (multiple chunks from same entry)
    const seen = new Set<string>()
    const entries: MemoryEntry[] = []

    for (const point of searchResult) {
      const payload = point.payload as Record<string, unknown>
      const parentId = String(payload.parentId ?? point.id)

      if (seen.has(parentId)) continue
      seen.add(parentId)

      entries.push({
        id: parentId,
        content: String(payload.fullContent ?? payload.content ?? ''),
        type: (payload.type as MemoryEntry['type']) ?? 'semantic',
        timestamp: String(payload.timestamp ?? ''),
        metadata: this.extractMetadata(payload),
      })
    }

    return entries
  }

  async forget(id: string): Promise<void> {
    await this.ensureCollection()
    // Delete all chunks for this parentId
    await this.client.delete(this.collectionName, {
      wait: true,
      filter: {
        must: [{ key: 'parentId', match: { value: id } }],
      },
    })
  }

  async clear(): Promise<void> {
    await this.ensureCollection()
    await this.client.delete(this.collectionName, {
      wait: true,
      filter: { must: [{ key: 'type', match: { any: ['semantic', 'episodic', 'preference'] } }] },
    })
  }

  async getAll(): Promise<MemoryEntry[]> {
    await this.ensureCollection()

    const result = await this.client.scroll(this.collectionName, {
      limit: 100,
      with_payload: true,
    })

    // Deduplicate by parentId
    const seen = new Set<string>()
    const entries: MemoryEntry[] = []

    for (const point of result.points) {
      const payload = point.payload as Record<string, unknown>
      const parentId = String(payload.parentId ?? point.id)
      if (seen.has(parentId)) continue
      seen.add(parentId)

      entries.push({
        id: parentId,
        content: String(payload.fullContent ?? payload.content ?? ''),
        type: (payload.type as MemoryEntry['type']) ?? 'semantic',
        timestamp: String(payload.timestamp ?? ''),
        metadata: this.extractMetadata(payload),
      })
    }

    return entries
  }

  // ── Chunking ──────────────────────────────────────────────────────────────

  /**
   * Splits text into chunks of approximately maxLen characters,
   * breaking at sentence boundaries when possible.
   */
  private chunk(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text]

    const chunks: string[] = []
    let remaining = text

    while (remaining.length > 0) {
      if (remaining.length <= maxLen) {
        chunks.push(remaining)
        break
      }

      // Try to break at sentence boundary
      let breakPoint = remaining.lastIndexOf('. ', maxLen)
      if (breakPoint < maxLen * 0.5) {
        breakPoint = remaining.lastIndexOf(' ', maxLen)
      }
      if (breakPoint < maxLen * 0.3) {
        breakPoint = maxLen
      }

      chunks.push(remaining.slice(0, breakPoint + 1).trim())
      remaining = remaining.slice(breakPoint + 1).trim()
    }

    return chunks
  }

  // ── Metadata helpers ──────────────────────────────────────────────────────

  private flattenMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    const flat: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        flat[key] = value
      } else if (value !== null && value !== undefined) {
        flat[key] = JSON.stringify(value)
      }
    }
    return flat
  }

  private extractMetadata(payload: Record<string, unknown>): Record<string, unknown> {
    const skip = new Set(['content', 'fullContent', 'type', 'timestamp', 'chunkIndex', 'totalChunks', 'parentId'])
    const metadata: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(payload)) {
      if (!skip.has(key)) {
        metadata[key] = value
      }
    }
    return metadata
  }

  // ── TTL & Compaction ────────────────────────────────────────────────────────

  /**
   * Removes entries older than maxAgeDays from the collection.
   * Call periodically (e.g. daily cron or on startup).
   */
  async compact(maxAgeDays: number = 30): Promise<number> {
    await this.ensureCollection()
    const log = getLogger().child({ component: 'QdrantMemory' })
    const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString()

    try {
      const result = await this.client.delete(this.collectionName, {
        wait: true,
        filter: {
          must: [{ key: 'timestamp', range: { lt: cutoff } }],
        },
      })
      const deleted = (result as { status?: string }).status === 'completed' ? 1 : 0
      log.info({ maxAgeDays, cutoff, deleted }, 'Compaction completed')
      return deleted
    } catch (err) {
      log.error({ err }, 'Compaction failed')
      return 0
    }
  }
}
