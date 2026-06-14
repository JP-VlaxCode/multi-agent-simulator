import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import Graph from 'graphology'
import type { MemoryEntry, RetrieveOptions } from '../types/index.js'
import type { IMemory } from './memory.interface.js'

interface NodeAttributes {
  type: string
  label: string
  [key: string]: unknown
}

interface EdgeAttributes {
  relation: string
  timestamp: string
  [key: string]: unknown
}

interface GraphSnapshot {
  nodes: Array<{ key: string; attributes: NodeAttributes }>
  edges: Array<{ source: string; target: string; attributes: EdgeAttributes }>
}

export class GraphMemory implements IMemory {
  private graph = new Graph()
  private loadPromise: Promise<void> | null = null

  constructor(private readonly storePath: string = './data/graph.json') {}

  private async load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise
    this.loadPromise = (async () => {
      try {
        await mkdir('./data', { recursive: true })
        if (existsSync(this.storePath)) {
          const raw = await readFile(this.storePath, 'utf-8')
          const snapshot = JSON.parse(raw) as GraphSnapshot
          snapshot.nodes.forEach((n) => this.graph.addNode(n.key, n.attributes))
          snapshot.edges.forEach((e) =>
            this.graph.addEdge(e.source, e.target, e.attributes)
          )
        }
      } catch {
        this.graph = new Graph()
      }
    })()
    return this.loadPromise
  }

  private async persist(): Promise<void> {
    await mkdir('./data', { recursive: true })
    const snapshot: GraphSnapshot = { nodes: [], edges: [] }
    this.graph.forEachNode((key, attrs) =>
      snapshot.nodes.push({ key, attributes: attrs as NodeAttributes })
    )
    this.graph.forEachEdge((_, attrs, source, target) =>
      snapshot.edges.push({ source, target, attributes: attrs as EdgeAttributes })
    )
    await writeFile(this.storePath, JSON.stringify(snapshot, null, 2), 'utf-8')
  }

  async store(entry: Omit<MemoryEntry, 'id' | 'timestamp'>): Promise<MemoryEntry> {
    await this.load()
    const meta = entry.metadata as { entity?: string; relatesTo?: string; relation?: string; entityType?: string }

    // Entity resolution: normalize and try to find existing similar entity
    const entityKey = this.resolveEntity(meta.entity)
    const relatesToKey = this.resolveEntity(meta.relatesTo)

    if (entityKey && !this.graph.hasNode(entityKey)) {
      this.graph.addNode(entityKey, {
        type: meta.entityType ?? String(entry.type),
        label: meta.entity ?? entityKey,
      })
    }
    if (entityKey && relatesToKey) {
      if (!this.graph.hasNode(relatesToKey)) {
        this.graph.addNode(relatesToKey, { type: 'unknown', label: meta.relatesTo ?? relatesToKey })
      }
      // Avoid self-loops
      if (entityKey !== relatesToKey) {
        this.graph.addEdge(entityKey, relatesToKey, {
          relation: meta.relation ?? 'related',
          timestamp: new Date().toISOString(),
        })
      }
    }
    await this.persist()
    return { ...entry, id: uuidv4(), timestamp: new Date().toISOString() }
  }

  /**
   * Entity resolution: normalizes entity names and resolves aliases.
   * - Lowercase + trim
   * - Strip common prefixes (unidad, residente, vecino del)
   * - Match emails to person names if already in graph
   */
  private resolveEntity(raw?: string): string | undefined {
    if (!raw) return undefined
    let key = raw.toLowerCase().trim()

    // Strip common noise prefixes
    key = key
      .replace(/^(el |la |los |las |un |una )/, '')
      .replace(/^vecino del?\s*/, '')
      .replace(/^residente\s+(de la\s+)?/, '')
      .trim()

    // Check if an existing node matches (fuzzy: contained or contains)
    if (!this.graph.hasNode(key)) {
      let bestMatch: string | null = null
      this.graph.forEachNode((existingKey) => {
        // If the new entity is a substring of existing or vice versa (min 4 chars)
        if (key.length >= 4 && existingKey.length >= 4) {
          if (existingKey.includes(key) || key.includes(existingKey)) {
            // Prefer the shorter, more canonical form
            bestMatch = existingKey.length <= key.length ? existingKey : key
          }
        }
      })
      if (bestMatch) return bestMatch
    }

    return key
  }

  async retrieve(query: string, options?: RetrieveOptions): Promise<MemoryEntry[]> {
    await this.load()
    const k = options?.k ?? 10
    const q = query.toLowerCase()
    const now = Date.now()
    const results: MemoryEntry[] = []

    this.graph.forEachNode((key, attrs) => {
      const label = String((attrs as NodeAttributes).label ?? key).toLowerCase()
      if (key.toLowerCase().includes(q) || label.includes(q)) {
        // Temporal decay: edges with recent timestamps score higher
        let recencyScore = 0
        try {
          this.graph.forEachEdge(key, (_, edgeAttrs) => {
            const edgeTs = (edgeAttrs as EdgeAttributes).timestamp
            if (edgeTs) {
              const ageMs = now - new Date(edgeTs).getTime()
              const daysSince = ageMs / 86_400_000
              // Exponential decay: halves every 30 days
              recencyScore += Math.pow(0.5, daysSince / 30)
            }
          })
        } catch { /* node might have no edges */ }

        const degree = this.graph.degree(key) || 0

        results.push({
          id: key,
          content: `Entidad: ${key} (${(attrs as NodeAttributes).type}) — ${(attrs as NodeAttributes).label}`,
          metadata: {
            ...attrs as Record<string, unknown>,
            degree,
            recencyScore: Math.round(recencyScore * 100) / 100,
          },
          timestamp: new Date().toISOString(),
          type: 'graph-node',
        })
      }
    })

    // Sort by combined score: degree * 0.4 + recency * 0.6
    return results
      .sort((a, b) => {
        const scoreA = (Number(a.metadata.degree) || 0) * 0.4 + (Number(a.metadata.recencyScore) || 0) * 0.6
        const scoreB = (Number(b.metadata.degree) || 0) * 0.4 + (Number(b.metadata.recencyScore) || 0) * 0.6
        return scoreB - scoreA
      })
      .slice(0, k)
  }

  async forget(id: string): Promise<void> {
    await this.load()
    if (this.graph.hasNode(id)) this.graph.dropNode(id)
    await this.persist()
  }

  async clear(): Promise<void> {
    this.graph.clear()
    await this.persist()
  }

  async getAll(): Promise<MemoryEntry[]> {
    await this.load()
    const entries: MemoryEntry[] = []
    this.graph.forEachNode((key, attrs) => {
      entries.push({
        id: key,
        content: String((attrs as NodeAttributes).label ?? key),
        metadata: attrs as Record<string, unknown>,
        timestamp: new Date().toISOString(),
        type: 'graph-node',
      })
    })
    return entries
  }

  getGraph(): Graph {
    return this.graph
  }

  async getGraphData(): Promise<{
    nodes: Array<{ id: string; label: string; type: string }>
    edges: Array<{ source: string; target: string; relation: string }>
  }> {
    await this.load()
    const nodes: Array<{ id: string; label: string; type: string }> = []
    const edges: Array<{ source: string; target: string; relation: string }> = []

    this.graph.forEachNode((key, attrs) => {
      nodes.push({
        id: key,
        label: String((attrs as NodeAttributes).label ?? key),
        type: String((attrs as NodeAttributes).type ?? 'unknown'),
      })
    })
    this.graph.forEachEdge((_, attrs, source, target) => {
      edges.push({
        source,
        target,
        relation: String((attrs as EdgeAttributes).relation ?? ''),
      })
    })
    return { nodes, edges }
  }
}
