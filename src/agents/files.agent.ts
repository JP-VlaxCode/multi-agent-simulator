import { Agent, SlidingWindowConversationManager, McpClient } from '@strands-agents/sdk'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { v4 as uuidv4 } from 'uuid'
import { resolve } from 'path'
import type { IBus } from '../bus/bus.interface.js'
import type { IMemory } from '../memory/memory.interface.js'
import { MemoryEnrichmentHook } from '../memory/hooks/memory-enrichment.hook.js'
import { MemoryPersistenceHook } from '../memory/hooks/memory-persistence.hook.js'
import { getModel } from './model.factory.js'

const SYSTEM = `Eres un agente especialista en gestión de archivos.
Solo puedes operar dentro del directorio sandbox permitido.
Puedes listar directorios, leer archivos, crear archivos y eliminarlos.
Responde siempre en español con el contenido o resultado de la operación solicitada.`

export class FilesAgent {
  private agent!: Agent

  constructor(
    private readonly bus: IBus,
    private readonly memory: IMemory
  ) {}

  async start(): Promise<void> {
    const mcpClient = new McpClient({
      applicationName: 'files-agent',
      transport: new StdioClientTransport({
        command: 'tsx',
        args: [resolve('./src/mcp-servers/filesystem.server.ts')],
      }),
    })

    this.agent = new Agent({
      model: getModel(),
      tools: [mcpClient],
      systemPrompt: SYSTEM,
      conversationManager: new SlidingWindowConversationManager({ windowSize: 20 }),
    })

    const enricher = new MemoryEnrichmentHook(this.memory, this.memory)
    const persister = new MemoryPersistenceHook(this.memory)

    this.bus.subscribe('files-agent', async (msg) => {
      if (msg.type !== 'TASK') return
      const task = String(msg.payload)
      try {
        const enrichedTask = await enricher.enrich(task)
        const result = await this.agent.invoke(enrichedTask)
        const resultText = typeof result === 'string' ? result : String(result)
        await persister.persist('files-agent', task, resultText)
        this.bus.publish({
          id: uuidv4(),
          from: 'files-agent',
          to: msg.from,
          type: 'RESULT',
          payload: resultText,
          timestamp: new Date().toISOString(),
          correlationId: msg.id,
        })
      } catch (err) {
        this.bus.publish({
          id: uuidv4(),
          from: 'files-agent',
          to: msg.from,
          type: 'ERROR',
          payload: String(err),
          timestamp: new Date().toISOString(),
          correlationId: msg.id,
        })
      }
    })
  }
}
