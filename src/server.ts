import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import cors from 'cors'

import { loadEnv, createLogger, getLogger } from './config/index.js'
import { createBus } from './bus/bus.factory.js'
import { deadLetterQueue } from './bus/dead-letter.js'
import { createMemory } from './memory/memory.factory.js'
import { AgentRegistry } from './agents/agent-registry.js'
import { OrchestratorAgent } from './agents/orchestrator.agent.js'
import { onShutdown, setupGracefulShutdown } from './utils/shutdown.js'
import { metrics } from './utils/metrics.js'

// ── Bootstrap ────────────────────────────────────────────────────────────────
const env = loadEnv()
const log = createLogger()

log.info({ env: env.NODE_ENV, port: env.PORT }, 'Starting server')

setupGracefulShutdown()

// ── Infrastructure ───────────────────────────────────────────────────────────
const bus = await createBus()
await deadLetterQueue.load()

const { composite: memory, shortTerm, longTerm, graph, custom } = createMemory()

// ── Registry manages all specialist agents ───────────────────────────────────
const registry     = new AgentRegistry(bus, memory)
const orchestrator = new OrchestratorAgent(bus, registry)

await registry.startAll()

// ── Express + Socket.io ──────────────────────────────────────────────────────
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

// ── Request logging middleware ───────────────────────────────────────────────
app.use((req, _res, next) => {
  log.debug({ method: req.method, url: req.url }, 'Request')
  next()
})

// ── Task endpoint ────────────────────────────────────────────────────────────
app.post('/task', async (req, res) => {
  const { task } = req.body as { task?: string }
  if (!task?.trim()) { res.status(400).json({ error: 'task is required' }); return }

  const startTime = Date.now()
  try {
    const result = await orchestrator.runTask(task)
    const duration = Date.now() - startTime
    log.info({ task: task.slice(0, 80), duration }, 'Task completed')
    res.json({ result, duration })
  } catch (err) {
    const duration = Date.now() - startTime
    log.error({ err, task: task.slice(0, 80), duration }, 'Task failed')
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
  io.emit('agent:status', registry.getStatus())
  res.json(result)
})

// ── Memory endpoints ─────────────────────────────────────────────────────────
app.get('/memory', async (_req, res) => {
  try {
    const [stEntries, ltEntries, graphEntries, customEntries] = await Promise.all([
      shortTerm.getAll(), longTerm.getAll(), graph.getAll(), custom.getAll(),
    ])
    const strip = (entries: unknown[]) =>
      (entries as Array<Record<string, unknown>>).map(({ embedding: _e, ...rest }) => rest)
    res.json({
      shortTerm: strip(stEntries),
      longTerm: strip(ltEntries),
      graph: strip(graphEntries),
      custom: strip(customEntries),
    })
  } catch (err) { res.status(500).json({ error: String(err) }) }
})

app.get('/memory/graph-data', async (_req, res) => {
  try { res.json(await graph.getGraphData()) }
  catch (err) { res.status(500).json({ error: String(err) }) }
})

// ── Metrics endpoint ──────────────────────────────────────────────────────────
app.get('/metrics', (_req, res) => {
  res.json(metrics.getSnapshot())
})

// ── Dead Letter Queue endpoints ──────────────────────────────────────────────
app.get('/dlq', (_req, res) => {
  res.json({ count: deadLetterQueue.getCount(), entries: deadLetterQueue.getAll() })
})

app.delete('/dlq/:msgId', async (req, res) => {
  const removed = await deadLetterQueue.remove(req.params.msgId)
  res.json({ ok: removed })
})

app.delete('/dlq', async (_req, res) => {
  await deadLetterQueue.clear()
  res.json({ ok: true })
})

// ── Health check (detailed) ──────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  const agents = registry.getStatus()
  const healthy = agents.filter(a => a.running).length
  const total = agents.filter(a => a.enabled).length
  const snap = metrics.getSnapshot()

  res.json({
    status: healthy === total ? 'ok' : 'degraded',
    uptime: process.uptime(),
    agents: { healthy, total },
    bus: 'connected',
    memory: { shortTerm: 'ok', longTerm: 'ok', graph: 'ok', custom: 'ok' },
    metrics: { totalTasks: snap.totalTasks, totalErrors: snap.totalErrors, deadLetter: snap.deadLetterCount },
    env: env.NODE_ENV,
  })
})

// ── Error handling middleware ─────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log.error({ err }, 'Unhandled Express error')
  res.status(500).json({ error: 'Internal server error' })
})

// ── Start server ─────────────────────────────────────────────────────────────
httpServer.listen(env.PORT, () => {
  log.info({ port: env.PORT }, 'Server running')
})

// Periodic metrics log every 60s
const metricsInterval = metrics.startPeriodicLog(60_000)

// ── Shutdown hooks ───────────────────────────────────────────────────────────
onShutdown('metrics-interval', () => clearInterval(metricsInterval))

onShutdown('http-server', () => {
  return new Promise<void>((resolve) => httpServer.close(() => resolve()))
})

onShutdown('agent-registry', async () => {
  const agents = registry.getStatus().filter(a => a.running)
  await Promise.all(agents.map(a => registry.stop(a.id)))
})

onShutdown('redis-bus', async () => {
  if ('disconnect' in bus && typeof (bus as { disconnect: unknown }).disconnect === 'function') {
    await (bus as { disconnect: () => Promise<void> }).disconnect()
  }
})
