import type { IMemory } from '../memory.interface.js'
import { extractEntities } from '../entity-extractor.js'

export class MemoryPersistenceHook {
  constructor(private readonly memory: IMemory) {}

  async persist(agentId: string, task: string, result: string): Promise<void> {
    const content = `[${agentId}] Task: ${task.slice(0, 200)} | Result: ${result.slice(0, 400)}`

    // Short-term: episodic (in-memory, current session)
    await this.memory.store({
      content,
      type: 'episodic',
      metadata: { agentId, task: task.slice(0, 200) },
    }).catch(() => {})

    // Long-term: semantic (persisted to disk, retrieval by embeddings)
    await this.memory.store({
      content,
      type: 'semantic',
      metadata: { agentId, task: task.slice(0, 200) },
    }).catch(() => {})

    // Graph: LLM-based entity extraction → graph nodes + edges
    const entities = await extractEntities(agentId, task, result)
    for (const entity of entities) {
      await this.memory.store({
        content: entity.name,
        type: 'graph-node',
        metadata: {
          entity:     entity.name,
          entityType: entity.type,
          relatesTo:  agentId,
          relation:   entity.relation,
        },
      }).catch(() => {})
    }
  }
}
