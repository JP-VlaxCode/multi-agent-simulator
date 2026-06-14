import { generateText } from 'ai'
import { createAzure } from '@ai-sdk/azure'

export interface ExtractedEntity {
  name: string
  type: 'person' | 'service' | 'channel' | 'file' | 'email' | 'phone' | 'topic'
  relation: string
}

function fallbackExtract(result: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = []

  // emails
  for (const e of result.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/gi) ?? []) {
    entities.push({ name: e, type: 'email', relation: 'mentioned' })
  }
  // phones
  for (const p of result.match(/\+\d[\d\s\-]{6,14}/g) ?? []) {
    entities.push({ name: p.trim(), type: 'phone', relation: 'mentioned' })
  }
  // #channels
  for (const c of result.match(/#[\w-]+/g) ?? []) {
    entities.push({ name: c, type: 'channel', relation: 'mentioned' })
  }
  // known services
  for (const s of ['Teams', 'WhatsApp', 'Email', 'FileSystem']) {
    if (new RegExp(`\\b${s}\\b`, 'i').test(result)) {
      entities.push({ name: s, type: 'service', relation: 'used' })
    }
  }
  // file paths
  for (const f of result.match(/\/[\w/-]+\.\w+|\/[\w/-]+/g) ?? []) {
    if (!f.includes('@')) entities.push({ name: f, type: 'file', relation: 'accessed' })
  }

  return [...new Map(entities.map(e => [e.name, e])).values()] // deduplicate
}

export async function extractEntities(
  agentId: string,
  task: string,
  result: string,
): Promise<ExtractedEntity[]> {
  try {
    const azure = createAzure({
      baseURL:    process.env.AZURE_OPENAI_ENDPOINT!,
      apiKey:     process.env.AZURE_OPENAI_API_KEY!,
      apiVersion: process.env.AZURE_API_VERSION ?? '2024-04-01-preview',
      useDeploymentBasedUrls: true,
    })
    const model = azure.chat(process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-5.4-mini')

    const { text } = await generateText({
      model,
      maxOutputTokens: 400,
      prompt: `Extrae entidades de esta interacción de agente y devuelve SOLO un array JSON válido, sin texto adicional ni bloques de código.

Agente: ${agentId}
Tarea: ${task.slice(0, 200)}
Resultado: ${result.slice(0, 300)}

Devuelve un array JSON con objetos: {"name":"...","type":"...","relation":"..."}
- type debe ser uno de: person, service, channel, file, email, phone, topic
- Incluye personas mencionadas, servicios usados (Teams/WhatsApp/Email), canales (#nombre), archivos (/ruta), emails, teléfonos, temas relevantes
- Si no hay entidades, devuelve: []

Ejemplo válido: [{"name":"Teams","type":"service","relation":"sent_to"},{"name":"general","type":"channel","relation":"sent_to"}]`,
    })

    // extract JSON array from response (handles markdown code blocks too)
    const match = text.match(/\[[\s\S]*?\]/)
    if (!match) {
      console.warn('[EntityExtractor] No JSON array in response, using fallback. Response:', text.slice(0, 100))
      return fallbackExtract(result)
    }

    const parsed = JSON.parse(match[0]) as Array<{ name: string; type: string; relation: string }>
    const valid = parsed.filter(
      (e): e is ExtractedEntity =>
        typeof e.name === 'string' &&
        typeof e.type === 'string' &&
        typeof e.relation === 'string' &&
        e.name.length > 0,
    )

    console.log(`[EntityExtractor] ${agentId}: extracted ${valid.length} entities:`, valid.map(e => `${e.type}:${e.name}`).join(', '))
    return valid

  } catch (err) {
    console.error('[EntityExtractor] LLM extraction failed, using regex fallback:', err)
    const fallback = fallbackExtract(result)
    if (fallback.length) {
      console.log(`[EntityExtractor] Fallback found ${fallback.length} entities:`, fallback.map(e => `${e.type}:${e.name}`).join(', '))
    }
    return fallback
  }
}
