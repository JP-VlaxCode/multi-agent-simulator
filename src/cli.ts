import 'dotenv/config'
import * as readline from 'readline'
import { InMemoryBus } from './bus/in-memory.bus.js'
import { ShortTermMemory } from './memory/short-term.memory.js'
import { LongTermMemory } from './memory/long-term.memory.js'
import { GraphMemory } from './memory/graph.memory.js'
import { CustomMemory } from './memory/custom.memory.js'
import { CompositeMemory } from './memory/composite.memory.js'
import { OrchestratorAgent } from './agents/orchestrator.agent.js'
import { EmailAgent } from './agents/email.agent.js'
import { CommunicationAgent } from './agents/communication.agent.js'
import { FilesAgent } from './agents/files.agent.js'
import { DocumentationAgent } from './agents/documentation.agent.js'
import type { BusMessage } from './types/index.js'

const bus = new InMemoryBus()

const memory = new CompositeMemory({
  shortTerm: new ShortTermMemory(50),
  longTerm: new LongTermMemory(),
  graph: new GraphMemory(),
  custom: new CustomMemory(),
})

const orchestrator = new OrchestratorAgent(bus)
const emailAgent = new EmailAgent(bus, memory)
const commAgent = new CommunicationAgent(bus, memory)
const filesAgent = new FilesAgent(bus, memory)
const docAgent = new DocumentationAgent(bus)

await Promise.all([
  emailAgent.start(),
  commAgent.start(),
  filesAgent.start(),
  docAgent.start(),
])

// Show bus events in terminal
bus.subscribe('broadcast', (msg: BusMessage) => {
  const label = msg.type === 'TASK' ? '→' : msg.type === 'RESULT' ? '✓' : msg.type === 'ERROR' ? '✗' : '·'
  const payload = typeof msg.payload === 'string' ? msg.payload.slice(0, 80) : ''
  console.log(`  [bus] ${label} ${msg.from} → ${msg.to}${payload ? `: ${payload}` : ''}`)
})

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

console.log('\n=== Multi-Agent Simulator ===')
console.log('Agentes disponibles: email, comunicaciones, archivos, documentación')
console.log('Escribe tu tarea y presiona Enter. Escribe "salir" para terminar.\n')

function prompt(): void {
  rl.question('> ', async (input) => {
    const task = input.trim()
    if (!task) { prompt(); return }
    if (task === 'salir' || task === 'exit') { rl.close(); process.exit(0) }

    console.log('\n[Procesando...]\n')
    try {
      const result = await orchestrator.runTask(task)
      console.log(`\n✅ Resultado:\n${result}\n`)
    } catch (err) {
      console.error(`\n❌ Error: ${String(err)}\n`)
    }
    prompt()
  })
}

prompt()
