import { createAzure } from '@ai-sdk/azure'
import { VercelModel } from '@strands-agents/sdk/models/vercel'

let _model: VercelModel | null = null

export function getModel(): VercelModel {
  if (_model) return _model
  const azure = createAzure({
    baseURL: process.env.AZURE_OPENAI_ENDPOINT!,
    apiKey: process.env.AZURE_OPENAI_API_KEY!,
    apiVersion: process.env.AZURE_API_VERSION ?? '2024-04-01-preview',
    useDeploymentBasedUrls: true,
  })
  _model = new VercelModel({ provider: azure.chat(process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-5.4-mini') })
  return _model
}
