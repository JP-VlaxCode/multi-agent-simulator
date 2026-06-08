import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'

interface Email {
  id: string
  from: string
  to: string
  subject: string
  body: string
  timestamp: string
  read: boolean
}

const inbox: Email[] = [
  {
    id: uuidv4(),
    from: 'maria.garcia@empresa.com',
    to: 'user@empresa.com',
    subject: 'Reunión de equipo - Jueves',
    body: 'Hola, recordar que tenemos reunión el jueves a las 10am en la sala B. Favor confirmar asistencia.',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    read: false,
  },
  {
    id: uuidv4(),
    from: 'sistemas@empresa.com',
    to: 'user@empresa.com',
    subject: 'Alerta: Servidor caído',
    body: 'El servidor de producción PRD-02 reportó error 500 a las 08:32. El equipo está investigando.',
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    read: false,
  },
  {
    id: uuidv4(),
    from: 'juan.perez@cliente.com',
    to: 'user@empresa.com',
    subject: 'Consulta sobre propuesta',
    body: 'Buenos días, quería consultar sobre el estado de la propuesta comercial que enviamos la semana pasada. ¿Tienen alguna novedad?',
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    read: true,
  },
]

const sent: Email[] = []

const server = new McpServer({ name: 'email-simulator', version: '1.0.0' })

server.tool('read_inbox', 'Lee los emails en la bandeja de entrada', {}, async () => {
  const emails = inbox.map((e) => `[${e.id.slice(0, 8)}] De: ${e.from} | ${e.subject} | ${e.read ? 'Leído' : 'No leído'} | ${e.timestamp}`).join('\n')
  return { content: [{ type: 'text', text: emails || 'Bandeja de entrada vacía.' }] }
})

server.tool(
  'get_email',
  'Obtiene el contenido completo de un email por ID',
  { id: z.string().describe('ID del email (primeros 8 caracteres son suficientes)') },
  async ({ id }) => {
    const email = inbox.find((e) => e.id.startsWith(id))
    if (!email) return { content: [{ type: 'text', text: `Email con ID ${id} no encontrado.` }] }
    email.read = true
    const text = `De: ${email.from}\nPara: ${email.to}\nAsunto: ${email.subject}\nFecha: ${email.timestamp}\n\n${email.body}`
    return { content: [{ type: 'text', text }] }
  }
)

server.tool(
  'search_emails',
  'Busca emails por texto en asunto o cuerpo',
  { query: z.string().describe('Texto a buscar') },
  async ({ query }) => {
    const q = query.toLowerCase()
    const results = inbox.filter(
      (e) => e.subject.toLowerCase().includes(q) || e.body.toLowerCase().includes(q) || e.from.toLowerCase().includes(q)
    )
    if (results.length === 0) return { content: [{ type: 'text', text: 'No se encontraron emails.' }] }
    const text = results.map((e) => `[${e.id.slice(0, 8)}] ${e.from} — ${e.subject}`).join('\n')
    return { content: [{ type: 'text', text }] }
  }
)

server.tool(
  'send_email',
  'Envía un email',
  {
    to: z.string().describe('Destinatario (email)'),
    subject: z.string().describe('Asunto del email'),
    body: z.string().describe('Cuerpo del email'),
  },
  async ({ to, subject, body }) => {
    const email: Email = {
      id: uuidv4(),
      from: 'user@empresa.com',
      to,
      subject,
      body,
      timestamp: new Date().toISOString(),
      read: true,
    }
    sent.push(email)
    return { content: [{ type: 'text', text: `Email enviado a ${to}. ID: ${email.id.slice(0, 8)}` }] }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
