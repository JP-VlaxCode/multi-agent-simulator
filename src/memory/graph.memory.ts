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
  private loaded = false

  constructor(private readonly storePath: string = './data/graph.json') {}

  private async load(): Promise<void> {
    if (this.loaded) return
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
    this.loaded = true
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
    const meta = entry.metadata as { entity?: string; relatesTo?: string; relation?: string }
    if (meta.entity && !this.graph.hasNode(meta.entity)) {
      this.graph.addNode(meta.entity, { type: entry.type, label: entry.content })
    }
    if (meta.entity && meta.relatesTo) {
      if (!this.graph.hasNode(meta.relatesTo)) {
        this.graph.addNode(meta.relatesTo, { type: 'unknown', label: meta.relatesTo })
      }
      this.graph.addEdge(meta.entity, meta.relatesTo, {
        relation: meta.relation ?? 'related',
        timestamp: new Date().toISOString(),
      })
    }
    await this.persist()
    return { ...entry, id: uuidv4(), timestamp: new Date().toISOString() }
  }

  async retrieve(query: string, options?: RetrieveOptions): Promise<MemoryEntry[]> {
    await this.load()
    const k = options?.k ?? 10
    const q = query.toLowerCase()
    const results: MemoryEntry[] = []

    this.graph.forEachNode((key, attrs) => {
      const label = String((attrs as NodeAttributes).label ?? key).toLowerCase()
      if (key.toLowerCase().includes(q) || label.includes(q)) {
        results.push({
          id: key,
          content: `Entidad: ${key} (${(attrs as NodeAttributes).type}) — ${(attrs as NodeAttributes).label}`,
          metadata: { ...attrs as Record<string, unknown>, degree: this.graph.degree(key) },
          timestamp: new Date().toISOString(),
          type: 'graph-node',
        })
      }
    })

    return results
      .sort((a, b) => (Number(b.metadata.degree) || 0) - (Number(a.metadata.degree) || 0))
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
