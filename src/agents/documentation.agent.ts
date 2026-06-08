import { Agent, SlidingWindowConversationManager, McpClient } from '@strands-agents/sdk'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { v4 as uuidv4 } from 'uuid'
import { resolve } from 'path'
import type { IBus } from '../bus/bus.interface.js'
import type { BusMessage } from '../types/index.js'
import { getModel } from './model.factory.js'

const SYSTEM = `Eres un agente de documentación y auditoría.
Tu función es:
1. Registrar todos los eventos del sistema en el audit trail.
2. Responder consultas sobre documentación interna.
3. Generar reportes de sesión cuando se te solicite.
Responde siempre en español.`

export class DocumentationAgent {
  private agent!: Agent
  private mcpClient!: McpClient

  constructor(private readonly bus: IBus) {}

  async start(): Promise<void> {
    this.mcpClient = new McpClient({
      applicationName: 'documentation-agent',
      transport: new StdioClientTransport({
        command: 'tsx',
        args: [resolve('./src/mcp-servers/documentation.server.ts')],
      }),
    })

    this.agent = new Agent({
      model: getModel(),
      tools: [this.mcpClient],
      systemPrompt: SYSTEM,
      conversationManager: new SlidingWindowConversationManager({ windowSize: 30 }),
    })

    // Auto-log all bus events
    this.bus.subscribe('broadcast', async (msg: BusMessage) => {
      if (msg.type === 'LOG') return
      try {
        const details = typeof msg.payload === 'string'
          ? msg.payload.slice(0, 200)
          : JSON.stringify(msg.payload).slice(0, 200)
        await this.agent.invoke(
          `Registra este evento en el audit trail: agent=${msg.from}, action=${msg.type}, details="${msg.to}: ${details}"`
        )
      } catch {
        // silently ignore log failures
      }
    })

    // Also handle direct TASK messages (queries, report generation)
    this.bus.subscribe('documentation-agent', async (msg) => {
      if (msg.type !== 'TASK') return
      const task = String(msg.payload)
      try {
        const result = await this.agent.invoke(task)
        const resultText = typeof result === 'string' ? result : String(result)
        this.bus.publish({
          id: uuidv4(),
          from: 'documentation-agent',
          to: msg.from,
          type: 'RESULT',
          payload: resultText,
          timestamp: new Date().toISOString(),
          correlationId: msg.id,
        })
      } catch (err) {
        this.bus.publish({
          id: uuidv4(),
          from: 'documentation-agent',
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
