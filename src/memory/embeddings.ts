import ModelClient, { isUnexpected } from '@azure-rest/ai-inference'
import { AzureKeyCredential } from '@azure/core-auth'
import { getEnv } from '../config/env.js'
import { withRetry } from '../utils/retry.js'
import { getLogger } from '../config/logger.js'

let _client: ReturnType<typeof ModelClient> | null = null

function getClient() {
  if (_client) return _client
  const env = getEnv()
  if (!env.AZURE_EMBEDDING_ENDPOINT || !env.AZURE_EMBEDDING_API_KEY) {
    throw new Error('Embedding endpoint not configured')
  }
  _client = ModelClient(
    env.AZURE_EMBEDDING_ENDPOINT,
    new AzureKeyCredential(env.AZURE_EMBEDDING_API_KEY),
    { apiVersion: env.AZURE_EMBEDDING_API_VERSION },
  )
  return _client
}

export async function getEmbedding(text: string): Promise<number[]> {
  const log = getLogger().child({ component: 'embeddings' })

  return withRetry(
    async () => {
      const client = getClient()
      const response = await client.path('/embeddings').post({
        body: { input: [text] },
      })

      if (isUnexpected(response)) {
        throw new Error(`Embedding error: ${JSON.stringify(response.body.error)}`)
      }

      return (response.body.data[0] as { embedding: number[] }).embedding
    },
    {
      maxAttempts: 2,
      baseDelay: 1000,
      label: 'getEmbedding',
      nonRetriable: (err) => {
        const msg = String(err)
        // Don't retry if not configured
        return msg.includes('not configured') || msg.includes('400')
      },
    },
  ).catch((err) => {
    log.debug({ err: String(err) }, 'Embedding failed, returning empty')
    throw err
  })
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    getLogger().warn({ dimA: a.length, dimB: b.length }, 'Embedding dimension mismatch')
    return 0
  }
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}
