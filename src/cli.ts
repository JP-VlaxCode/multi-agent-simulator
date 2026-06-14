import 'dotenv/config'
import * as readline from 'readline'

import { loadEnv, createLogger } from './config/index.js'
import { createBus } from './bus/bus.factory.js'
import { createMemory } from './memory/memory.factory.js'
import { AgentRegistry } from './agents/agent-registry.js'
import { OrchestratorAgent } from './agents/orchestrator.agent.js'
import { setupGracefulShutdown, onShutdown } from './utils/shutdown.js'
import type { BusMessage } from './types/index.js'

// ── Bootstrap ────────────────────────────────────────────────────────────────
loadEnv()
const log = createLogger()

setupGracefulShutdown()

const bus = await createBus()

const { composite: memory } = createMemory()

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

onShutdown('readline', () => rl.close())
onShutdown('agent-registry', async () => {
  const agents = registry.getStatus().filter(a => a.running)
  await Promise.all(agents.map(a => registry.stop(a.id)))
})

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
    const start = Date.now()
    try {
      const result = await orchestrator.runTask(task)
      const duration = Date.now() - start
      console.log(`\n✅ Resultado (${duration}ms):\n${result}\n`)
    } catch (err) {
      log.error({ err }, 'Task failed')
      console.error(`\n❌ Error: ${String(err)}\n`)
    }
    prompt()
  })
}

prompt()
