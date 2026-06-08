import type { AgentId, BusMessage } from '../types/index.js'

export interface IBus {
  publish(msg: BusMessage): void
  subscribe(agentId: AgentId | 'broadcast', handler: (msg: BusMessage) => void): void
  unsubscribe(agentId: AgentId | 'broadcast'): void
}
