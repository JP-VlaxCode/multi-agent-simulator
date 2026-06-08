import { Agent, SlidingWindowConversationManager, McpClient } from '@strands-agents/sdk'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { v4 as uuidv4 } from 'uuid'
import { resolve } from 'path'
import type { IBus } from '../bus/bus.interface.js'
import type { IMemory } from '../memory/memory.interface.js'
import { MemoryEnrichmentHook } from '../memory/hooks/memory-enrichment.hook.js'
import { MemoryPersistenceHook } from '../memory/hooks/memory-persistence.hook.js'
import { getModel } from './model.factory.js'

const SYSTEM = `Eres un agente especialista en comunicaciones por mensajería.
Tienes acceso a Microsoft Teams (canales del equipo) y WhatsApp (mensajes directos).
Tools disponibles:
- Teams: list_channels, read_channel, teams_send_message
- WhatsApp: get_contacts, read_chat, whatsapp_send_message
Responde siempre en español. Sé conciso y directo.`

export class CommunicationAgent {
  private agent!: Agent

  constructor(
    private readonly bus: IBus,
    private readonly memory: IMemory
  ) {}

  async start(): Promise<void> {
    const teamsMcp = new McpClient({
      applicationName: 'teams-client',
      transport: new StdioClientTransport({
        command: 'tsx',
        args: [resolve('./src/mcp-servers/teams.server.ts')],
      }),
    })

    const whatsappMcp = new McpClient({
      applicationName: 'whatsapp-client',
      transport: new StdioClientTransport({
        command: 'tsx',
        args: [resolve('./src/mcp-servers/whatsapp.server.ts')],
      }),
    })

    this.agent = new Agent({
      model: getModel(),
      tools: [teamsMcp, whatsappMcp],
      systemPrompt: SYSTEM,
      conversationManager: new SlidingWindowConversationManager({ windowSize: 20 }),
    })

    const enricher = new MemoryEnrichmentHook(this.memory, this.memory)
    const persister = new MemoryPersistenceHook(this.memory)

    this.bus.subscribe('communication-agent', async (msg) => {
      if (msg.type !== 'TASK') return
      const task = String(msg.payload)
      try {
        const enrichedTask = await enricher.enrich(task)
        const result = await this.agent.invoke(enrichedTask)
        const resultText = typeof result === 'string' ? result : String(result)
        await persister.persist('communication-agent', task, resultText)
        this.bus.publish({
          id: uuidv4(),
          from: 'communication-agent',
          to: msg.from,
          type: 'RESULT',
          payload: resultText,
          timestamp: new Date().toISOString(),
          correlationId: msg.id,
        })
      } catch (err) {
        this.bus.publish({
          id: uuidv4(),
          from: 'communication-agent',
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
