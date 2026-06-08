import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

interface Contact {
  name: string
  phone: string
}

interface Message {
  from: string
  text: string
  timestamp: string
}

const contacts: Contact[] = [
  { name: 'Juan Pérez', phone: '+56912345678' },
  { name: 'María García', phone: '+56987654321' },
  { name: 'Carlos Mora', phone: '+56911223344' },
]

const chats: Record<string, Message[]> = {
  '+56912345678': [
    { from: 'Juan Pérez', text: 'Hola! ¿Cómo va el proyecto?', timestamp: new Date(Date.now() - 7200000).toISOString() },
    { from: 'user', text: 'Bien, avanzando. Te mando el reporte hoy.', timestamp: new Date(Date.now() - 7100000).toISOString() },
  ],
  '+56987654321': [
    { from: 'María García', text: 'Recuerda la reunión de mañana!', timestamp: new Date(Date.now() - 3600000).toISOString() },
  ],
}

const server = new McpServer({ name: 'whatsapp-simulator', version: '1.0.0' })

server.tool('get_contacts', 'Lista los contactos de WhatsApp', {}, async () => {
  const text = contacts.map((c) => `${c.name} — ${c.phone}`).join('\n')
  return { content: [{ type: 'text', text }] }
})

server.tool(
  'read_chat',
  'Lee la conversación con un contacto',
  { phone: z.string().describe('Número de teléfono del contacto') },
  async ({ phone }) => {
    const msgs = chats[phone]
    if (!msgs || msgs.length === 0)
      return { content: [{ type: 'text', text: `Sin mensajes con ${phone}.` }] }
    const text = msgs.map((m) => `[${m.timestamp}] ${m.from}: ${m.text}`).join('\n')
    return { content: [{ type: 'text', text }] }
  }
)

server.tool(
  'whatsapp_send_message',
  'Envía un mensaje de WhatsApp',
  {
    phone: z.string().describe('Número de teléfono del destinatario'),
    text: z.string().describe('Texto del mensaje'),
  },
  async ({ phone, text }) => {
    if (!chats[phone]) chats[phone] = []
    chats[phone].push({ from: 'user', text, timestamp: new Date().toISOString() })
    const contact = contacts.find((c) => c.phone === phone)
    return {
      content: [{ type: 'text', text: `Mensaje enviado a ${contact?.name ?? phone}: "${text}"` }],
    }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
