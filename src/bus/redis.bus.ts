import Redis from 'ioredis'
import { EventEmitter } from 'events'
import type { AgentId, BusMessage } from '../types/index.js'
import type { IBus } from './bus.interface.js'
import { getLogger } from '../config/logger.js'

/**
 * Redis Pub/Sub bus implementation.
 * Uses two Redis connections: one for publishing, one for subscribing.
 * Messages are also stored in a Redis Stream for replay/debugging (TTL: 24h).
 */
export class RedisBus extends EventEmitter implements IBus {
  private pub: Redis
  private sub: Redis
  private readonly channel = 'agent-bus'
  private readonly streamKey = 'agent-bus:stream'
  private readonly streamMaxLen = 10_000
  private connected = false

  constructor(private readonly redisUrl: string) {
    super()
    this.setMaxListeners(30)
    this.pub = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 3 })
    this.sub = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 3 })
  }

  async connect(): Promise<void> {
    const log = getLogger().child({ component: 'RedisBus' })

    await Promise.all([this.pub.connect(), this.sub.connect()])
    this.connected = true
    log.info('Connected to Redis')

    await this.sub.subscribe(this.channel)
    this.sub.on('message', (_channel, raw) => {
      try {
        const msg = JSON.parse(raw) as BusMessage
        // Emit to specific target
        this.emit(msg.to, msg)
        // Emit to broadcast listeners
        if (msg.to !== 'broadcast') {
          this.emit('broadcast', msg)
        }
      } catch (err) {
        log.error({ err, raw: raw.slice(0, 200) }, 'Failed to parse bus message')
      }
    })

    this.pub.on('error', (err) => log.error({ err }, 'Redis pub error'))
    this.sub.on('error', (err) => log.error({ err }, 'Redis sub error'))
  }

  publish(msg: BusMessage): void {
    const raw = JSON.stringify(msg)

    if (this.connected) {
      // Publish to Pub/Sub channel
      this.pub.publish(this.channel, raw).catch(() => {})
      // Also append to stream for replay (auto-trim to maxLen)
      this.pub
        .xadd(this.streamKey, 'MAXLEN', '~', String(this.streamMaxLen), '*', 'msg', raw)
        .catch(() => {})
    } else {
      // Fallback: emit locally if Redis not connected
      this.emit(msg.to, msg)
      if (msg.to !== 'broadcast') {
        this.emit('broadcast', msg)
      }
    }
  }

  subscribe(agentId: AgentId | 'broadcast', handler: (msg: BusMessage) => void): void {
    this.on(agentId, handler)
  }

  unsubscribeHandler(agentId: AgentId | 'broadcast', handler: (msg: BusMessage) => void): void {
    this.removeListener(agentId, handler)
  }

  unsubscribe(agentId: AgentId | 'broadcast'): void {
    this.removeAllListeners(agentId)
  }

  async disconnect(): Promise<void> {
    await this.sub.unsubscribe(this.channel)
    this.sub.disconnect()
    this.pub.disconnect()
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }
}
