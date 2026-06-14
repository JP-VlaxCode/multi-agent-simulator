import { z } from 'zod'

/**
 * Schema de validación de variables de entorno.
 * Falla rápido al startup si falta algo crítico.
 */
const envSchema = z.object({
  // Azure OpenAI — Text model
  AZURE_OPENAI_ENDPOINT: z.string().url('AZURE_OPENAI_ENDPOINT debe ser una URL válida'),
  AZURE_OPENAI_API_KEY: z.string().min(1, 'AZURE_OPENAI_API_KEY es requerido'),
  AZURE_OPENAI_DEPLOYMENT: z.string().default('gpt-5.4-mini'),
  AZURE_API_VERSION: z.string().default('2024-04-01-preview'),

  // Azure AI Inference — Embedding model (opcional)
  AZURE_EMBEDDING_ENDPOINT: z.string().url().optional(),
  AZURE_EMBEDDING_API_KEY: z.string().optional(),
  AZURE_EMBEDDING_API_VERSION: z.string().default('2023-05-15'),

  // Server
  PORT: z.coerce.number().int().positive().default(3010),
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),

  // Redis (opcional — si no está, usa InMemoryBus)
  REDIS_URL: z.string().url().optional(),

  // Qdrant (opcional — si no está, usa LongTermMemory con JSON)
  QDRANT_URL: z.string().url().optional(),
  QDRANT_COLLECTION: z.string().default('agent-memory'),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
})

export type Env = z.infer<typeof envSchema>

let _env: Env | null = null

/**
 * Parsea y valida process.env. Lanza error descriptivo si falta configuración.
 */
export function loadEnv(): Env {
  if (_env) return _env

  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    const errors = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    console.error(`\n❌ Error de configuración:\n${errors}\n`)
    process.exit(1)
  }

  _env = result.data
  return _env
}

/** Acceso al env ya validado (debe llamarse después de loadEnv) */
export function getEnv(): Env {
  if (!_env) throw new Error('loadEnv() must be called before getEnv()')
  return _env
}
