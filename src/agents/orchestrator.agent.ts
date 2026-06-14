import { generateText, tool, stepCountIs } from 'ai'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import type { IBus } from '../bus/bus.interface.js'
import type { BusMessage, AgentId } from '../types/index.js'
import type { AgentRegistry } from './agent-registry.js'
import { getOrchestratorModel, llmCircuitBreaker } from './model.factory.js'
import { withRetry } from '../utils/retry.js'
import { metrics } from '../utils/metrics.js'
import { childLogger } from '../config/logger.js'

export class OrchestratorAgent {
  private pendingTasks = new Map<string, (result: string) => void>()
  private readonly log = childLogger({ component: 'orchestrator' })

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
    const timeoutMs = this.registry.getTimeoutMs(targetId)
    this.log.debug({ targetId, msgId, timeoutMs, task: task.slice(0, 100) }, 'Delegating task')

    const promise = new Promise<string>((resolve) => {
      this.pendingTasks.set(msgId, resolve)
      setTimeout(() => {
        if (this.pendingTasks.has(msgId)) {
          this.pendingTasks.delete(msgId)
          this.log.warn({ targetId, msgId, timeoutMs }, 'Agent timeout')
          resolve('[Timeout] El agente no respondió a tiempo.')
        }
      }, timeoutMs)
    })

    this.bus.publish({
      id: msgId, from: 'orchestrator', to: targetId as AgentId,
      type: 'TASK', payload: task, timestamp: new Date().toISOString(),
    })

    return promise
  }

  async runTask(userInput: string): Promise<string> {
    const correlationId = uuidv4()
    const log = this.log.child({ correlationId, input: userInput.slice(0, 80) })
    const startTime = Date.now()
    log.info('Task received')

    const model = getOrchestratorModel()

    // Build tools dynamically from currently active agents
    const activeAgents = this.registry.getActiveDescriptions()
    const taskSchema = z.object({ task: z.string() })

    const tools = Object.fromEntries(
      activeAgents.map(({ id, description }) => [
        id.replace(/-/g, '_'),
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

    // Use circuit breaker + retry for LLM call
    const { text } = await llmCircuitBreaker.execute(() =>
      withRetry(
        () => generateText({ model, system, prompt: userInput, stopWhen: stepCountIs(15), tools }),
        {
          maxAttempts: 3,
          baseDelay: 2000,
          label: 'orchestrator-generateText',
          nonRetriable: (err) => {
            const msg = String(err)
            return msg.includes('400') || msg.includes('content_filter')
          },
        },
      )
    )

    const latency = Date.now() - startTime
    metrics.recordTaskCompleted('orchestrator', latency, text.length)
    log.info({ resultLength: text.length, latency }, 'Task completed')
    return text
  }
}
