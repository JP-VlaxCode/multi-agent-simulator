import { Agent, SlidingWindowConversationManager, McpClient } from '@strands-agents/sdk'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { v4 as uuidv4 } from 'uuid'
import type { IBus } from '../bus/bus.interface.js'
import type { IMemory } from '../memory/memory.interface.js'
import { MemoryEnrichmentHook } from '../memory/hooks/memory-enrichment.hook.js'
import { MemoryPersistenceHook } from '../memory/hooks/memory-persistence.hook.js'
import { getModel } from './model.factory.js'
import { AGENT_CONFIGS, type AgentConfig } from './agent-config.js'
import type { AgentId } from '../types/index.js'

interface RunningAgent {
  config: AgentConfig
  unsubscribe: () => void
}

export class AgentRegistry {
  private running = new Map<string, RunningAgent>()
  private configs = new Map<string, AgentConfig>()

  constructor(
    private readonly bus: IBus,
    private readonly memory: IMemory,
  ) {
    for (const cfg of AGENT_CONFIGS) {
      this.configs.set(cfg.id, cfg)
    }
  }

  /** Start all agents that have enabled: true in config */
  async startAll(): Promise<void> {
    const enabled = AGENT_CONFIGS.filter(c => c.enabled)
    await Promise.all(enabled.map(c => this.start(c.id)))
    console.log(`[Registry] Started ${this.running.size} agents: ${[...this.running.keys()].join(', ')}`)
  }

  async start(id: string): Promise<{ ok: boolean; error?: string }> {
    if (this.running.has(id)) return { ok: false, error: 'Already running' }
    const config = this.configs.get(id)
    if (!config) return { ok: false, error: `Unknown agent: ${id}` }

    try {
      const mcpClients = config.mcpServers.map(s =>
        new McpClient({
          applicationName: id,
          transport: new StdioClientTransport({ command: s.command, args: s.args }),
        })
      )

      const agent = new Agent({
        model: getModel(),
        tools: mcpClients,
        systemPrompt: config.systemPrompt,
        conversationManager: new SlidingWindowConversationManager({ windowSize: 20 }),
      })

      const enricher = new MemoryEnrichmentHook(this.memory, this.memory)
      const persister = new MemoryPersistenceHook(this.memory)

      const handler = async (msg: Parameters<Parameters<typeof this.bus.subscribe>[1]>[0]) => {
        if (msg.type !== 'TASK') return
        const task = String(msg.payload)
        try {
          const enrichedTask = await enricher.enrich(task)
          const result = await agent.invoke(enrichedTask)
          const resultText = typeof result === 'string' ? result : String(result)
          await persister.persist(id, task, resultText)
          this.bus.publish({
            id: uuidv4(), from: id as AgentId,
            to: msg.from, type: 'RESULT',
            payload: resultText, timestamp: new Date().toISOString(),
            correlationId: msg.id,
          })
        } catch (err) {
          this.bus.publish({
            id: uuidv4(), from: id as AgentId,
            to: msg.from, type: 'ERROR',
            payload: String(err), timestamp: new Date().toISOString(),
            correlationId: msg.id,
          })
        }
      }

      this.bus.subscribe(id as AgentId, handler)

      // Broadcast listener: silently log all bus events (e.g. documentation-agent)
      if (config.broadcastListener) {
        const broadcastHandler = async (msg: Parameters<typeof handler>[0]) => {
          if (msg.type === 'LOG' || msg.from === id) return
          const details = typeof msg.payload === 'string'
            ? msg.payload.slice(0, 200)
            : JSON.stringify(msg.payload).slice(0, 200)
          try {
            await agent.invoke(
              `Registra este evento: agent=${msg.from}, action=${msg.type}, details="${msg.to}: ${details}"`
            )
          } catch { /* silently ignore audit failures */ }
        }
        this.bus.subscribe('broadcast', broadcastHandler)
        this.running.set(id, {
          config,
          unsubscribe: () => {
            this.bus.unsubscribe(id as AgentId)
            this.bus.unsubscribe('broadcast')
          },
        })
      } else {
        this.running.set(id, {
          config,
          unsubscribe: () => this.bus.unsubscribe(id as AgentId),
        })
      }

      console.log(`[Registry] ✓ Started: ${id}`)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  }

  async stop(id: string): Promise<{ ok: boolean; error?: string }> {
    const running = this.running.get(id)
    if (!running) return { ok: false, error: 'Not running' }
    running.unsubscribe()
    this.running.delete(id)
    console.log(`[Registry] ✗ Stopped: ${id}`)
    return { ok: true }
  }

  async toggle(id: string): Promise<{ ok: boolean; running: boolean; error?: string }> {
    if (this.running.has(id)) {
      const result = await this.stop(id)
      return { ...result, running: false }
    } else {
      const result = await this.start(id)
      return { ...result, running: result.ok }
    }
  }

  getStatus(): Array<{ id: string; label: string; running: boolean; enabled: boolean; description: string }> {
    return [...this.configs.values()].map(c => ({
      id: c.id,
      label: c.label,
      running: this.running.has(c.id),
      enabled: c.enabled,
      description: c.description,
    }))
  }

  /** Returns tool descriptions for all currently running agents — used by Orchestrator */
  getActiveDescriptions(): Array<{ id: string; description: string }> {
    return [...this.running.keys()].map(id => ({
      id,
      description: this.configs.get(id)!.orchestratorDescription,
    }))
  }
}
