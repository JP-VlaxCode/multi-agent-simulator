import ModelClient, { isUnexpected } from '@azure-rest/ai-inference'
import { AzureKeyCredential } from '@azure/core-auth'

let _client: ReturnType<typeof ModelClient> | null = null

function getClient() {
  if (_client) return _client
  // Endpoint: base URL of the deployment (without /embeddings path)
  // e.g. https://corp-coe-data-westus.openai.azure.com/openai/deployments/text-embedding-3-small-metis
  const endpoint = process.env.AZURE_EMBEDDING_ENDPOINT!
  const apiKey = process.env.AZURE_EMBEDDING_API_KEY!
  const apiVersion = process.env.AZURE_EMBEDDING_API_VERSION ?? '2023-05-15'
  _client = ModelClient(endpoint, new AzureKeyCredential(apiKey), { apiVersion })
  return _client
}

export async function getEmbedding(text: string): Promise<number[]> {
  const client = getClient()
  const response = await client.path('/embeddings').post({
    body: { input: [text] },
  })

  if (isUnexpected(response)) {
    throw new Error(`Embedding error: ${JSON.stringify(response.body.error)}`)
  }

  return (response.body.data[0] as { embedding: number[] }).embedding
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}
