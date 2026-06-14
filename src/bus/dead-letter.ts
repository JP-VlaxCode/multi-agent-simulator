import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { getLogger } from '../config/logger.js'
import { metrics } from '../utils/metrics.js'
import type { BusMessage } from '../types/index.js'

export interface DeadLetterEntry {
  message: BusMessage
  error: string
  failedAt: string
  retries: number
}

/**
 * Dead Letter Queue — stores messages that couldn't be processed.
 * Persists to disk for review. Exposes API for inspection and replay.
 */
export class DeadLetterQueue {
  private entries: DeadLetterEntry[] = []
  private readonly maxEntries = 500

  constructor(private readonly storePath: string = './data/dead-letter.json') {}

  async load(): Promise<void> {
    try {
      await mkdir('./data', { recursive: true })
      if (existsSync(this.storePath)) {
        const raw = await readFile(this.storePath, 'utf-8')
        this.entries = JSON.parse(raw) as DeadLetterEntry[]
      }
    } catch {
      this.entries = []
    }
  }

  private async persist(): Promise<void> {
    await mkdir('./data', { recursive: true })
    await writeFile(this.storePath, JSON.stringify(this.entries, null, 2), 'utf-8')
  }

  async add(message: BusMessage, error: string): Promise<void> {
    const entry: DeadLetterEntry = {
      message,
      error,
      failedAt: new Date().toISOString(),
      retries: 0,
    }

    this.entries.push(entry)
    metrics.recordDeadLetter()

    // Evict oldest if over limit
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries)
    }

    await this.persist()
    getLogger().child({ component: 'DLQ' }).warn({ msgId: message.id, from: message.from, to: message.to, error }, 'Message sent to DLQ')
  }

  async remove(msgId: string): Promise<boolean> {
    const before = this.entries.length
    this.entries = this.entries.filter(e => e.message.id !== msgId)
    if (this.entries.length < before) {
      await this.persist()
      return true
    }
    return false
  }

  async clear(): Promise<void> {
    this.entries = []
    await this.persist()
  }

  getAll(): DeadLetterEntry[] {
    return [...this.entries]
  }

  getCount(): number {
    return this.entries.length
  }
}

/** Singleton DLQ */
export const deadLetterQueue = new DeadLetterQueue()
