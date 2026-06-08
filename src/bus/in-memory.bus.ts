import { EventEmitter } from 'events'
import type { AgentId, BusMessage } from '../types/index.js'
import type { IBus } from './bus.interface.js'

export class InMemoryBus extends EventEmitter implements IBus {
  constructor() {
    super()
    this.setMaxListeners(20)
  }

  publish(msg: BusMessage): void {
    // emit to specific target
    this.emit(msg.to, msg)
    // always emit to broadcast listeners (except if already broadcast)
    if (msg.to !== 'broadcast') {
      this.emit('broadcast', msg)
    }
  }

  subscribe(agentId: AgentId | 'broadcast', handler: (msg: BusMessage) => void): void {
    this.on(agentId, handler)
  }

  unsubscribe(agentId: AgentId | 'broadcast'): void {
    this.removeAllListeners(agentId)
  }
}
