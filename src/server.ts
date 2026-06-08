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
import { OrchestratorAgent } from './agents/orchestrator.agent.js'
import { EmailAgent } from './agents/email.agent.js'
import { CommunicationAgent } from './agents/communication.agent.js'
import { FilesAgent } from './agents/files.agent.js'
import { DocumentationAgent } from './agents/documentation.agent.js'

const PORT = Number(process.env.PORT ?? 3000)

// --- Infrastructure ---
const bus = new InMemoryBus()

const shortTerm  = new ShortTermMemory(50)
const longTerm   = new LongTermMemory()
const graph      = new GraphMemory()
const custom     = new CustomMemory()

const memory = new CompositeMemory({ shortTerm, longTerm, graph, custom })

// --- Agents ---
const orchestrator = new OrchestratorAgent(bus)
const emailAgent   = new EmailAgent(bus, memory)
const commAgent    = new CommunicationAgent(bus, memory)
const filesAgent   = new FilesAgent(bus, memory)
const docAgent     = new DocumentationAgent(bus)

await Promise.all([
  emailAgent.start(),
  commAgent.start(),
  filesAgent.start(),
  docAgent.start(),
])

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

app.get('/memory', async (_req, res) => {
  try {
    const [stEntries, ltEntries, graphEntries, customEntries] = await Promise.all([
      shortTerm.getAll(),
      longTerm.getAll(),
      graph.getAll(),
      custom.getAll(),
    ])
    // strip embeddings (large vectors) before sending to frontend
    const strip = (entries: Awaited<ReturnType<typeof shortTerm.getAll>>) =>
      entries.map(({ embedding: _e, ...rest }) => rest)

    res.json({
      shortTerm:  strip(stEntries),
      longTerm:   strip(ltEntries),
      graph:      strip(graphEntries),
      custom:     strip(customEntries),
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.get('/memory/graph-data', async (_req, res) => {
  try {
    res.json(await graph.getGraphData())
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log('Multi-agent system ready.')
})
