import pino from 'pino'
import { getEnv } from './env.js'

let _logger: pino.Logger | null = null

export function createLogger(): pino.Logger {
  if (_logger) return _logger

  const env = getEnv()
  const isDev = env.NODE_ENV === 'development'

  _logger = pino({
    level: env.LOG_LEVEL,
    ...(isDev && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
    }),
    ...(!isDev && {
      formatters: {
        level: (label) => ({ level: label }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    }),
  })

  return _logger
}

/** Acceso global al logger (debe llamarse después de createLogger) */
export function getLogger(): pino.Logger {
  if (!_logger) throw new Error('createLogger() must be called before getLogger()')
  return _logger
}

/** Crea un child logger con contexto (agentId, correlationId, etc.) */
export function childLogger(bindings: Record<string, unknown>): pino.Logger {
  return getLogger().child(bindings)
}
