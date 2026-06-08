import 'dotenv/config'
import * as readline from 'readline'
import { InMemoryBus } from './bus/in-memory.bus.js'
import { ShortTermMemory } from './memory/short-term.memory.js'
import { LongTermMemory } from './memory/long-term.memory.js'
import { GraphMemory } from './memory/graph.memory.js'
import { CustomMemory } from './memory/custom.memory.js'
import { CompositeMemory } from './memory/composite.memory.js'
import { AgentRegistry } from './agents/agent-registry.js'
import { OrchestratorAgent } from './agents/orchestrator.agent.js'
import type { BusMessage } from './types/index.js'

const bus = new InMemoryBus()

const memory = new CompositeMemory({
  shortTerm: new ShortTermMemory(50),
  longTerm:  new LongTermMemory(),
  graph:     new GraphMemory(),
  custom:    new CustomMemory(),
})

const registry     = new AgentRegistry(bus, memory)
const orchestrator = new OrchestratorAgent(bus, registry)

await registry.startAll()

// Show bus events in terminal
bus.subscribe('broadcast', (msg: BusMessage) => {
  const label = msg.type === 'TASK' ? '→' : msg.type === 'RESULT' ? '✓' : msg.type === 'ERROR' ? '✗' : '·'
  const payload = typeof msg.payload === 'string' ? msg.payload.slice(0, 80) : ''
  console.log(`  [bus] ${label} ${msg.from} → ${msg.to}${payload ? `: ${payload}` : ''}`)
})

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

console.log('\n=== Multi-Agent Simulator ===')
console.log(`Agentes activos: ${registry.getStatus().filter(a => a.running).map(a => a.label).join(', ')}`)
console.log('Escribe tu tarea. "agentes" para ver estado. "salir" para terminar.\n')

function prompt(): void {
  rl.question('> ', async (input) => {
    const task = input.trim()
    if (!task) { prompt(); return }
    if (task === 'salir' || task === 'exit') { rl.close(); process.exit(0) }
    if (task === 'agentes') {
      registry.getStatus().forEach(a => console.log(`  ${a.running ? '●' : '○'} ${a.label} (${a.id})`))
      prompt(); return
    }

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
