import { generateText, tool, stepCountIs } from 'ai'
import { createAzure } from '@ai-sdk/azure'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import type { IBus } from '../bus/bus.interface.js'
import type { BusMessage, AgentId } from '../types/index.js'
import type { AgentRegistry } from './agent-registry.js'

export class OrchestratorAgent {
  private pendingTasks = new Map<string, (result: string) => void>()

  constructor(
    private readonly bus: IBus,
    private readonly registry: AgentRegistry,
  ) {
    this.bus.subscribe('orchestrator', (msg: BusMessage) => {
      if ((msg.type === 'RESULT' || msg.type === 'ERROR') && msg.correlationId) {
        const resolver = this.pendingTasks.get(msg.correlationId)
        if (resolver) {
          this.pendingTasks.delete(msg.correlationId)
          const text = typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload)
          resolver(msg.type === 'ERROR' ? `[Error] ${text}` : text)
        }
      }
    })
  }

  private async sendTask(targetId: string, task: string): Promise<string> {
    const msgId = uuidv4()
    const promise = new Promise<string>((resolve) => {
      this.pendingTasks.set(msgId, resolve)
      setTimeout(() => {
        if (this.pendingTasks.has(msgId)) {
          this.pendingTasks.delete(msgId)
          resolve('[Timeout] El agente no respondió a tiempo.')
        }
      }, 120_000)
    })
    this.bus.publish({
      id: msgId, from: 'orchestrator', to: targetId as AgentId,
      type: 'TASK', payload: task, timestamp: new Date().toISOString(),
    })
    return promise
  }

  async runTask(userInput: string): Promise<string> {
    const azureProvider = createAzure({
      baseURL:    process.env.AZURE_OPENAI_ENDPOINT!,
      apiKey:     process.env.AZURE_OPENAI_API_KEY!,
      apiVersion: process.env.AZURE_API_VERSION ?? '2024-04-01-preview',
      useDeploymentBasedUrls: true,
    })
    const model = azureProvider.chat(process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-5.4-mini')

    // Build tools dynamically from currently active agents
    const activeAgents = this.registry.getActiveDescriptions()
    const taskSchema = z.object({ task: z.string() })

    const tools = Object.fromEntries(
      activeAgents.map(({ id, description }) => [
        id.replace(/-/g, '_'),   // tool names must be valid identifiers
        tool({
          description,
          inputSchema: taskSchema,
          execute: ({ task }: { task: string }) => this.sendTask(id, task),
        }),
      ])
    )

    const agentList = activeAgents
      .map(a => `- ${a.id.replace(/-/g, '_')}: ${a.description}`)
      .join('\n')

    const system = `Eres el agente orquestador de un sistema multi-agente.
Agentes disponibles ahora mismo:
${agentList}

Analiza la tarea del usuario y delega a los agentes correctos.
Para incidencias residenciales: llama inspection_agent + resident_agent en paralelo, luego decision_agent con ambos resultados.
Sintetiza una respuesta final clara en español.`

    const { text } = await generateText({
      model, system, prompt: userInput,
      stopWhen: stepCountIs(15),
      tools,
    })

    return text
  }
}
