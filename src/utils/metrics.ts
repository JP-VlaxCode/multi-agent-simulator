import { getLogger } from '../config/logger.js'

export interface AgentMetrics {
  tasksCompleted: number
  tasksFailed: number
  totalLatencyMs: number
  lastLatencyMs: number
  avgLatencyMs: number
  tokensEstimated: number
}

export interface SystemMetrics {
  startedAt: string
  totalTasks: number
  totalErrors: number
  agents: Record<string, AgentMetrics>
  deadLetterCount: number
}

class MetricsCollector {
  private agents = new Map<string, AgentMetrics>()
  private totalTasks = 0
  private totalErrors = 0
  private deadLetterCount = 0
  private readonly startedAt = new Date().toISOString()

  private getOrCreate(agentId: string): AgentMetrics {
    if (!this.agents.has(agentId)) {
      this.agents.set(agentId, {
        tasksCompleted: 0,
        tasksFailed: 0,
        totalLatencyMs: 0,
        lastLatencyMs: 0,
        avgLatencyMs: 0,
        tokensEstimated: 0,
      })
    }
    return this.agents.get(agentId)!
  }

  recordTaskCompleted(agentId: string, latencyMs: number, resultLength: number): void {
    const m = this.getOrCreate(agentId)
    m.tasksCompleted++
    m.totalLatencyMs += latencyMs
    m.lastLatencyMs = latencyMs
    m.avgLatencyMs = Math.round(m.totalLatencyMs / m.tasksCompleted)
    // Rough token estimation: ~4 chars per token
    m.tokensEstimated += Math.ceil(resultLength / 4)
    this.totalTasks++
  }

  recordTaskFailed(agentId: string, latencyMs: number): void {
    const m = this.getOrCreate(agentId)
    m.tasksFailed++
    m.totalLatencyMs += latencyMs
    m.lastLatencyMs = latencyMs
    m.avgLatencyMs = Math.round(m.totalLatencyMs / (m.tasksCompleted + m.tasksFailed))
    this.totalErrors++
  }

  recordDeadLetter(): void {
    this.deadLetterCount++
  }

  getSnapshot(): SystemMetrics {
    const agents: Record<string, AgentMetrics> = {}
    for (const [id, m] of this.agents) {
      agents[id] = { ...m }
    }
    return {
      startedAt: this.startedAt,
      totalTasks: this.totalTasks,
      totalErrors: this.totalErrors,
      agents,
      deadLetterCount: this.deadLetterCount,
    }
  }

  /** Periodic log of metrics summary */
  startPeriodicLog(intervalMs: number = 60_000): NodeJS.Timeout {
    const log = getLogger().child({ component: 'metrics' })
    return setInterval(() => {
      const snap = this.getSnapshot()
      if (snap.totalTasks > 0 || snap.totalErrors > 0) {
        log.info({
          totalTasks: snap.totalTasks,
          totalErrors: snap.totalErrors,
          deadLetter: snap.deadLetterCount,
          agents: Object.entries(snap.agents).map(([id, m]) => ({
            id,
            completed: m.tasksCompleted,
            failed: m.tasksFailed,
            avgMs: m.avgLatencyMs,
          })),
        }, 'Metrics summary')
      }
    }, intervalMs)
  }
}

/** Singleton metrics collector */
export const metrics = new MetricsCollector()
