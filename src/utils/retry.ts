import { getLogger } from '../config/logger.js'

export interface RetryOptions {
  /** Max number of attempts (including first try) */
  maxAttempts?: number
  /** Initial delay in ms */
  baseDelay?: number
  /** Max delay in ms */
  maxDelay?: number
  /** Multiplier for exponential backoff */
  factor?: number
  /** Optional label for logging */
  label?: string
  /** Errors that should NOT be retried (e.g. 400 Bad Request) */
  nonRetriable?: (err: unknown) => boolean
}

const defaults: Required<Omit<RetryOptions, 'label' | 'nonRetriable'>> = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 30_000,
  factor: 2,
}

/**
 * Retry with exponential backoff + jitter.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const opts = { ...defaults, ...options }
  const log = getLogger().child({ component: 'retry', label: opts.label ?? 'unknown' })
  let lastError: unknown

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err

      // Don't retry non-retriable errors
      if (options?.nonRetriable?.(err)) {
        throw err
      }

      if (attempt === opts.maxAttempts) break

      const delay = Math.min(
        opts.baseDelay * Math.pow(opts.factor, attempt - 1) + Math.random() * 500,
        opts.maxDelay,
      )
      log.warn({ attempt, maxAttempts: opts.maxAttempts, delay: Math.round(delay), err: String(err) },
        'Retrying after failure')
      await new Promise((r) => setTimeout(r, delay))
    }
  }

  throw lastError
}

// ─── Circuit Breaker ─────────────────────────────────────────────────────────

export interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit */
  threshold?: number
  /** Time in ms to wait before trying again (half-open) */
  resetTimeout?: number
  /** Label for logging */
  label?: string
}

type CircuitState = 'closed' | 'open' | 'half-open'

export class CircuitBreaker {
  private state: CircuitState = 'closed'
  private failures = 0
  private lastFailure = 0
  private readonly threshold: number
  private readonly resetTimeout: number
  private readonly label: string

  constructor(options?: CircuitBreakerOptions) {
    this.threshold = options?.threshold ?? 5
    this.resetTimeout = options?.resetTimeout ?? 60_000
    this.label = options?.label ?? 'circuit'
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const log = getLogger().child({ component: 'circuit-breaker', label: this.label })

    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.state = 'half-open'
        log.info('Circuit half-open, attempting recovery')
      } else {
        throw new Error(`Circuit breaker OPEN for "${this.label}". Try again later.`)
      }
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (err) {
      this.onFailure(log)
      throw err
    }
  }

  private onSuccess(): void {
    this.failures = 0
    this.state = 'closed'
  }

  private onFailure(log: ReturnType<typeof getLogger>): void {
    this.failures++
    this.lastFailure = Date.now()
    if (this.failures >= this.threshold) {
      this.state = 'open'
      log.error({ failures: this.failures }, 'Circuit OPENED — too many failures')
    }
  }

  getState(): CircuitState {
    return this.state
  }

  reset(): void {
    this.state = 'closed'
    this.failures = 0
  }
}
