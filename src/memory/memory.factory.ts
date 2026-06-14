import { getEnv } from '../config/env.js'
import { getLogger } from '../config/logger.js'
import type { IMemory } from './memory.interface.js'
import { ShortTermMemory } from './short-term.memory.js'
import { LongTermMemory } from './long-term.memory.js'
import { GraphMemory } from './graph.memory.js'
import { CustomMemory } from './custom.memory.js'
import { QdrantMemory } from './qdrant.memory.js'
import { CompositeMemory } from './composite.memory.js'

export interface MemoryInstances {
  composite: CompositeMemory
  shortTerm: ShortTermMemory
  longTerm: IMemory
  graph: GraphMemory
  custom: CustomMemory
}

/**
 * Creates the memory stack based on environment configuration.
 * If QDRANT_URL is set, uses Qdrant for long-term semantic memory.
 * Otherwise falls back to JSON-based LongTermMemory.
 */
export function createMemory(): MemoryInstances {
  const env = getEnv()
  const log = getLogger()

  const shortTerm = new ShortTermMemory(50)
  const graph = new GraphMemory()
  const custom = new CustomMemory()

  let longTerm: IMemory

  if (env.QDRANT_URL) {
    longTerm = new QdrantMemory({
      url: env.QDRANT_URL,
      collectionName: env.QDRANT_COLLECTION,
    })
    log.info({ url: env.QDRANT_URL, collection: env.QDRANT_COLLECTION }, 'Memory: Qdrant vector store')
  } else {
    longTerm = new LongTermMemory()
    log.info('Memory: JSON-based long-term (no QDRANT_URL)')
  }

  const composite = new CompositeMemory({ shortTerm, longTerm, graph, custom })

  return { composite, shortTerm, longTerm, graph, custom }
}
