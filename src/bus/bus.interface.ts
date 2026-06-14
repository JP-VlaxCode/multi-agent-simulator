import type { AgentId, BusMessage } from '../types/index.js'

export interface IBus {
  publish(msg: BusMessage): void
  subscribe(agentId: AgentId | 'broadcast', handler: (msg: BusMessage) => void): void
  /** Remove a specific handler from a channel */
  unsubscribeHandler(agentId: AgentId | 'broadcast', handler: (msg: BusMessage) => void): void
  /** Remove ALL handlers from a channel (use with caution) */
  unsubscribe(agentId: AgentId | 'broadcast'): void
}
