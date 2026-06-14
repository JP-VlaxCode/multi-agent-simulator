import { getEnv } from '../config/env.js'
import { getLogger } from '../config/logger.js'
import type { IBus } from './bus.interface.js'
import { InMemoryBus } from './in-memory.bus.js'
import { RedisBus } from './redis.bus.js'

/**
 * Creates the appropriate bus implementation based on environment config.
 * If REDIS_URL is set, uses RedisBus. Otherwise falls back to InMemoryBus.
 */
export async function createBus(): Promise<IBus> {
  const env = getEnv()
  const log = getLogger()

  if (env.REDIS_URL) {
    const redisBus = new RedisBus(env.REDIS_URL)
    try {
      await redisBus.connect()
      log.info('Bus: Redis')
      return redisBus
    } catch (err) {
      log.warn({ err }, 'Redis connection failed, falling back to InMemoryBus')
      return new InMemoryBus()
    }
  }

  log.info('Bus: InMemory')
  return new InMemoryBus()
}
