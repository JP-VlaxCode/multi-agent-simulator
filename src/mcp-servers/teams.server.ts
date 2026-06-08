import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

interface Message {
  from: string
  content: string
  timestamp: string
}

const channels: Record<string, Message[]> = {
  general: [
    { from: 'carlos.mora', content: 'Buenos días equipo!', timestamp: new Date(Date.now() - 3600000).toISOString() },
    { from: 'ana.silva', content: 'Buenos días! ¿Alguien revisó el deploy de anoche?', timestamp: new Date(Date.now() - 3500000).toISOString() },
  ],
  proyectos: [
    { from: 'pedro.alv', content: 'Sprint review mañana 9am, preparar demos.', timestamp: new Date(Date.now() - 7200000).toISOString() },
  ],
  alertas: [
    { from: 'monitoreo-bot', content: '⚠️ CPU > 80% en PRD-01', timestamp: new Date(Date.now() - 1800000).toISOString() },
  ],
}

const server = new McpServer({ name: 'teams-simulator', version: '1.0.0' })

server.tool('list_channels', 'Lista todos los canales disponibles en Teams', {}, async () => {
  const text = Object.keys(channels).map((c) => `#${c} (${channels[c].length} mensajes)`).join('\n')
  return { content: [{ type: 'text', text }] }
})

server.tool(
  'read_channel',
  'Lee los mensajes de un canal de Teams',
  {
    channel: z.string().describe('Nombre del canal'),
    limit: z.number().optional().describe('Número de mensajes a leer (default 10)'),
  },
  async ({ channel, limit = 10 }) => {
    const msgs = channels[channel]
    if (!msgs) return { content: [{ type: 'text', text: `Canal #${channel} no existe.` }] }
    const text = msgs
      .slice(-limit)
      .map((m) => `[${m.timestamp}] ${m.from}: ${m.content}`)
      .join('\n')
    return { content: [{ type: 'text', text: text || 'Canal vacío.' }] }
  }
)

server.tool(
  'teams_send_message',
  'Envía un mensaje a un canal de Teams',
  {
    channel: z.string().describe('Nombre del canal'),
    content: z.string().describe('Contenido del mensaje'),
  },
  async ({ channel, content }) => {
    if (!channels[channel]) channels[channel] = []
    channels[channel].push({ from: 'user', content, timestamp: new Date().toISOString() })
    return { content: [{ type: 'text', text: `Mensaje enviado a #${channel}: "${content}"` }] }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
