import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import cors from 'cors'
import { InMemoryBus } from './bus/in-memory.bus.js'
import { ShortTermMemory } from './memory/short-term.memory.js'
import { LongTermMemory } from './memory/long-term.memory.js'
import { GraphMemory } from './memory/graph.memory.js'
import { CustomMemory } from './memory/custom.memory.js'
import { CompositeMemory } from './memory/composite.memory.js'
import { AgentRegistry } from './agents/agent-registry.js'
import { OrchestratorAgent } from './agents/orchestrator.agent.js'

const PORT = Number(process.env.PORT ?? 3000)

// --- Infrastructure ---
const bus = new InMemoryBus()

const shortTerm = new ShortTermMemory(50)
const longTerm  = new LongTermMemory()
const graph     = new GraphMemory()
const custom    = new CustomMemory()
const memory    = new CompositeMemory({ shortTerm, longTerm, graph, custom })

// --- Registry manages all specialist agents ---
const registry    = new AgentRegistry(bus, memory)
const orchestrator = new OrchestratorAgent(bus, registry)

await registry.startAll()

// --- Express + Socket.io ---
const app = express()
app.use(cors())
app.use(express.json())

const httpServer = createServer(app)
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
})

bus.subscribe('broadcast', (msg) => {
  io.emit('bus:event', msg)
})

// ── Task endpoint ────────────────────────────────────────────────────────────
app.post('/task', async (req, res) => {
  const { task } = req.body as { task?: string }
  if (!task?.trim()) { res.status(400).json({ error: 'task is required' }); return }
  try {
    const result = await orchestrator.runTask(task)
    res.json({ result })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: String(err) })
  }
})

// ── Agent registry API ───────────────────────────────────────────────────────
app.get('/agents', (_req, res) => {
  res.json(registry.getStatus())
})

app.post('/agents/:id/start', async (req, res) => {
  res.json(await registry.start(req.params.id))
})

app.post('/agents/:id/stop', async (req, res) => {
  res.json(await registry.stop(req.params.id))
})

app.post('/agents/:id/toggle', async (req, res) => {
  const result = await registry.toggle(req.params.id)
  io.emit('agent:status', registry.getStatus())  // notify frontend
  res.json(result)
})

// ── Memory endpoints ─────────────────────────────────────────────────────────
app.get('/memory', async (_req, res) => {
  try {
    const [stEntries, ltEntries, graphEntries, customEntries] = await Promise.all([
      shortTerm.getAll(), longTerm.getAll(), graph.getAll(), custom.getAll(),
    ])
    const strip = (entries: Awaited<ReturnType<typeof shortTerm.getAll>>) =>
      entries.map(({ embedding: _e, ...rest }) => rest)
    res.json({ shortTerm: strip(stEntries), longTerm: strip(ltEntries), graph: strip(graphEntries), custom: strip(customEntries) })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

app.get('/memory/graph-data', async (_req, res) => {
  try { res.json(await graph.getGraphData()) }
  catch (err) { res.status(500).json({ error: String(err) }) }
})

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log('Multi-agent system ready.')
})
