import { createAzure } from '@ai-sdk/azure'
import { VercelModel } from '@strands-agents/sdk/models/vercel'
import { getEnv } from '../config/env.js'
import { CircuitBreaker } from '../utils/retry.js'

let _model: VercelModel | null = null
let _orchestratorModel: ReturnType<ReturnType<typeof createAzure>['chat']> | null = null

/** Circuit breaker shared by all LLM calls */
export const llmCircuitBreaker = new CircuitBreaker({
  threshold: 5,
  resetTimeout: 60_000,
  label: 'azure-openai',
})

function getAzureProvider() {
  const env = getEnv()
  return createAzure({
    baseURL: env.AZURE_OPENAI_ENDPOINT,
    apiKey: env.AZURE_OPENAI_API_KEY,
    apiVersion: env.AZURE_API_VERSION,
    useDeploymentBasedUrls: true,
  })
}

/** Model for Strands agents (specialist agents) */
export function getModel(): VercelModel {
  if (_model) return _model
  const env = getEnv()
  const azure = getAzureProvider()
  _model = new VercelModel({ provider: azure.chat(env.AZURE_OPENAI_DEPLOYMENT) })
  return _model
}

/** Raw Vercel AI SDK model for use with generateText (orchestrator) */
export function getOrchestratorModel() {
  if (_orchestratorModel) return _orchestratorModel
  const env = getEnv()
  const azure = getAzureProvider()
  _orchestratorModel = azure.chat(env.AZURE_OPENAI_DEPLOYMENT)
  return _orchestratorModel
}
