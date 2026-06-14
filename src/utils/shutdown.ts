import { getLogger } from '../config/logger.js'

type ShutdownFn = () => Promise<void> | void

const hooks: Array<{ label: string; fn: ShutdownFn }> = []
let shutdownInProgress = false

/**
 * Register a cleanup function to be called on graceful shutdown.
 * Functions are called in reverse order (LIFO).
 */
export function onShutdown(label: string, fn: ShutdownFn): void {
  hooks.push({ label, fn })
}

/**
 * Execute all shutdown hooks and exit.
 * Call this once at startup to wire signal handlers.
 */
export function setupGracefulShutdown(): void {
  const handler = async (signal: string) => {
    if (shutdownInProgress) return
    shutdownInProgress = true

    const log = getLogger()
    log.info({ signal }, 'Shutdown signal received, cleaning up...')

    // Execute in reverse order (last registered = first to close)
    for (const hook of [...hooks].reverse()) {
      try {
        log.debug({ hook: hook.label }, 'Running shutdown hook')
        await hook.fn()
      } catch (err) {
        log.error({ err, hook: hook.label }, 'Shutdown hook failed')
      }
    }

    log.info('Shutdown complete')
    process.exit(0)
  }

  process.on('SIGINT', () => handler('SIGINT'))
  process.on('SIGTERM', () => handler('SIGTERM'))

  // Unhandled errors — log and exit
  process.on('uncaughtException', (err) => {
    const log = getLogger()
    log.fatal({ err }, 'Uncaught exception')
    handler('uncaughtException')
  })

  process.on('unhandledRejection', (reason) => {
    const log = getLogger()
    log.error({ reason }, 'Unhandled rejection')
    // Don't exit for unhandled rejections, just log
  })
}
