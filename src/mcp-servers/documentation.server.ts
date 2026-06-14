import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync, readdirSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'

const AUTHOR = 'JP-VlaxCode'
const AUTHOR_EMAIL = 'jose.luis.p10@hotmail.com'

interface AuditEvent {
  id: string
  agent: string
  action: string
  details: string
  timestamp: string
  loggedBy: string
}

const auditLog: AuditEvent[] = []
const SESSION_DATE = new Date().toISOString().split('T')[0]
const LOG_PATH = `./logs/audit-${SESSION_DATE}.json`
const DOCS_DIR = './docs'

await mkdir('./logs', { recursive: true })
await mkdir(DOCS_DIR, { recursive: true })

const server = new McpServer({ name: 'documentation-simulator', version: '1.0.0' })

server.tool(
  'log_event',
  'Registra un evento en el audit trail de la sesión',
  {
    agent: z.string().describe('Nombre del agente que ejecutó la acción'),
    action: z.string().describe('Acción realizada'),
    details: z.string().describe('Detalles adicionales'),
  },
  async ({ agent, action, details }) => {
    const event: AuditEvent = { id: uuidv4(), agent, action, details, timestamp: new Date().toISOString(), loggedBy: AUTHOR }
    auditLog.push(event)
    await writeFile(LOG_PATH, JSON.stringify(auditLog, null, 2), 'utf-8')
    return { content: [{ type: 'text', text: `Evento registrado: [${agent}] ${action}` }] }
  }
)

server.tool(
  'get_audit_trail',
  'Obtiene el historial de audit de la sesión actual',
  { agent: z.string().optional().describe('Filtrar por agente específico') },
  async ({ agent }) => {
    const filtered = agent ? auditLog.filter((e) => e.agent === agent) : auditLog
    if (filtered.length === 0) return { content: [{ type: 'text', text: 'No hay eventos registrados.' }] }
    const text = filtered
      .map((e) => `[${e.timestamp}] ${e.agent} → ${e.action}: ${e.details}`)
      .join('\n')
    return { content: [{ type: 'text', text }] }
  }
)

server.tool(
  'save_doc',
  'Guarda un documento en el directorio de docs',
  {
    name: z.string().describe('Nombre del archivo (sin extensión)'),
    content: z.string().describe('Contenido del documento'),
  },
  async ({ name, content }) => {
    const path = `${DOCS_DIR}/${name}.md`
    const header = `<!-- Author: ${AUTHOR} <${AUTHOR_EMAIL}> -->\n`
    await writeFile(path, header + content, 'utf-8')
    return { content: [{ type: 'text', text: `Documento guardado: ${path}` }] }
  }
)

server.tool(
  'query_docs',
  'Busca en los documentos existentes',
  { question: z.string().describe('Pregunta o término a buscar') },
  async ({ question }) => {
    if (!existsSync(DOCS_DIR)) return { content: [{ type: 'text', text: 'No hay documentos.' }] }
    const files = readdirSync(DOCS_DIR).filter((f) => f.endsWith('.md'))
    const q = question.toLowerCase()
    const results: string[] = []
    for (const file of files) {
      const content = await readFile(`${DOCS_DIR}/${file}`, 'utf-8')
      if (content.toLowerCase().includes(q)) {
        results.push(`## ${file}\n${content.slice(0, 500)}${content.length > 500 ? '...' : ''}`)
      }
    }
    return {
      content: [{ type: 'text', text: results.length > 0 ? results.join('\n\n---\n\n') : 'No se encontraron documentos relevantes.' }],
    }
  }
)

server.tool(
  'generate_report',
  'Genera un reporte de la sesión actual',
  {
    type: z.enum(['summary', 'audit', 'full']).describe('Tipo de reporte'),
  },
  async ({ type }) => {
    const now = new Date().toISOString()
    let content = `# Reporte de Sesión — ${now}\n\n`
    content += `> Generado por: **${AUTHOR}** (${AUTHOR_EMAIL})\n\n`

    if (type === 'audit' || type === 'full') {
      content += `## Audit Trail (${auditLog.length} eventos)\n\n`
      auditLog.forEach((e) => {
        content += `- [${e.timestamp}] **${e.agent}** → ${e.action}: ${e.details}\n`
      })
    }

    if (type === 'summary' || type === 'full') {
      const agentCounts: Record<string, number> = {}
      auditLog.forEach((e) => { agentCounts[e.agent] = (agentCounts[e.agent] ?? 0) + 1 })
      content += `\n## Resumen\n\n`
      content += `Total de acciones: ${auditLog.length}\n\n`
      Object.entries(agentCounts).forEach(([agent, count]) => {
        content += `- ${agent}: ${count} acciones\n`
      })
    }

    const reportPath = `${DOCS_DIR}/report-${SESSION_DATE}.md`
    await writeFile(reportPath, content, 'utf-8')
    return { content: [{ type: 'text', text: `Reporte generado: ${reportPath}\n\n${content.slice(0, 800)}` }] }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
