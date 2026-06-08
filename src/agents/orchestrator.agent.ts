import { generateText, tool, stepCountIs } from 'ai'
import { createAzure } from '@ai-sdk/azure'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import type { IBus } from '../bus/bus.interface.js'
import type { BusMessage, AgentId } from '../types/index.js'

const SYSTEM = `Eres el agente orquestador de un sistema multi-agente.
Tienes acceso a los siguientes agentes especialistas:
- email_agent: gestión de emails (leer bandeja, buscar, enviar)
- communication_agent: mensajería Teams y WhatsApp
- files_agent: operaciones de archivos en sandbox (leer, escribir, listar)
- documentation_agent: auditoría, documentos y reportes de sesión

Analiza la tarea del usuario y decide qué agentes deben intervenir.
Puedes llamar múltiples agentes cuando la tarea lo requiera.
Una vez que tengas todos los resultados, sintetiza una respuesta final clara y en español.`

type AgentTarget = 'email-agent' | 'communication-agent' | 'files-agent' | 'documentation-agent'

export class OrchestratorAgent {
  private pendingTasks = new Map<string, (result: string) => void>()

  constructor(private readonly bus: IBus) {
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

  private async sendTask(target: AgentTarget, task: string): Promise<string> {
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
      id: msgId,
      from: 'orchestrator',
      to: target as AgentId,
      type: 'TASK',
      payload: task,
      timestamp: new Date().toISOString(),
    })

    return promise
  }

  async runTask(userInput: string): Promise<string> {
    const azureProvider = createAzure({
      baseURL: process.env.AZURE_OPENAI_ENDPOINT!,
      apiKey: process.env.AZURE_OPENAI_API_KEY!,
      apiVersion: process.env.AZURE_API_VERSION ?? '2024-04-01-preview',
      useDeploymentBasedUrls: true,
    })
    const model = azureProvider.chat(process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-5.4-mini')

    const taskSchema = z.object({ task: z.string() })

    const { text } = await generateText({
      model,
      system: SYSTEM,
      prompt: userInput,
      stopWhen: stepCountIs(10),
      tools: {
        email_agent: tool({
          description: 'Delega una tarea al agente de emails (leer inbox, buscar, enviar emails)',
          inputSchema: taskSchema,
          execute: ({ task }: { task: string }) => this.sendTask('email-agent', task),
        }),
        communication_agent: tool({
          description: 'Delega una tarea al agente de comunicaciones (Teams channels y WhatsApp)',
          inputSchema: taskSchema,
          execute: ({ task }: { task: string }) => this.sendTask('communication-agent', task),
        }),
        files_agent: tool({
          description: 'Delega una tarea al agente de archivos (listar, leer, escribir archivos en sandbox)',
          inputSchema: taskSchema,
          execute: ({ task }: { task: string }) => this.sendTask('files-agent', task),
        }),
        documentation_agent: tool({
          description: 'Delega una tarea al agente de documentación (audit trail, reportes, consultas de docs)',
          inputSchema: taskSchema,
          execute: ({ task }: { task: string }) => this.sendTask('documentation-agent', task),
        }),
      },
    })

    return text
  }
}
