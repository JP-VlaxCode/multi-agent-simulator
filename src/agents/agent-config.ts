import { resolve } from 'path'

export interface McpServerConfig {
  command: string
  args: string[]
}

export interface AgentConfig {
  id: string
  label: string
  description: string
  enabled: boolean
  systemPrompt: string
  mcpServers: McpServerConfig[]
  orchestratorDescription: string
  /** If true, also subscribes to 'broadcast' to react to all bus events (e.g. audit logging) */
  broadcastListener?: boolean
}

const TSX = 'tsx'
const MCP = (name: string) => resolve(`./src/mcp-servers/${name}`)

export const AGENT_CONFIGS: AgentConfig[] = [
  {
    id: 'email-agent',
    label: 'Email',
    description: 'Gestiona emails: leer bandeja, buscar y enviar correos.',
    enabled: true,
    orchestratorDescription: 'Delega operaciones de email (leer inbox, buscar, enviar). Usa cuando la tarea involucra correos electrónicos.',
    systemPrompt: `Eres un agente especialista en gestión de emails.
Puedes leer la bandeja de entrada, buscar emails, obtener emails específicos y enviar nuevos emails.
Responde siempre en español. Sé conciso y directo en tus respuestas.`,
    mcpServers: [{ command: TSX, args: [MCP('email.server.ts')] }],
  },
  {
    id: 'communication-agent',
    label: 'Comm',
    description: 'Mensajería Teams y WhatsApp.',
    enabled: true,
    orchestratorDescription: 'Delega mensajería en Teams (canales) y WhatsApp (mensajes directos).',
    systemPrompt: `Eres un agente especialista en comunicaciones por mensajería.
Tools disponibles:
- Teams: list_channels, read_channel, teams_send_message
- WhatsApp: get_contacts, read_chat, whatsapp_send_message
Responde siempre en español. Sé conciso y directo.`,
    mcpServers: [
      { command: TSX, args: [MCP('teams.server.ts')] },
      { command: TSX, args: [MCP('whatsapp.server.ts')] },
    ],
  },
  {
    id: 'files-agent',
    label: 'Files',
    description: 'Operaciones de archivos en el sandbox permitido.',
    enabled: true,
    orchestratorDescription: 'Delega operaciones de archivos: listar, leer, escribir archivos en el sandbox.',
    systemPrompt: `Eres un agente especialista en gestión de archivos.
Solo puedes operar dentro del directorio sandbox permitido.
Puedes listar directorios, leer archivos, crear archivos y eliminarlos.
Responde siempre en español con el contenido o resultado de la operación solicitada.`,
    mcpServers: [{ command: TSX, args: [MCP('filesystem.server.ts')] }],
  },
  {
    id: 'documentation-agent',
    label: 'Docs',
    description: 'Auditoría, logs y generación de reportes.',
    enabled: true,
    broadcastListener: true,   // auto-logs every bus event
    orchestratorDescription: 'Delega tareas de documentación: audit trail, reportes de sesión, consultas de docs.',
    systemPrompt: `Eres un agente de documentación y auditoría.
Tu función es registrar eventos, responder consultas sobre documentación y generar reportes.
Cuando recibas un evento del bus para registrar, usa log_event con los detalles del agente y la acción.
Responde siempre en español.`,
    mcpServers: [{ command: TSX, args: [MCP('documentation.server.ts')] }],
  },
  {
    id: 'inspection-agent',
    label: 'Inspection',
    description: 'Inspecciona infracciones del reglamento de copropiedad.',
    enabled: true,
    orchestratorDescription: 'Inspecciona si una incidencia constituye infracción según el reglamento. Devuelve código, monto y base legal.',
    systemPrompt: `Eres un agente inspector de infracciones para una comunidad residencial.
Tu función es revisar el reglamento y determinar si una incidencia constituye infracción formal.
Para cada caso: consulta check_violation, indica código, monto y si es multa directa o advertencia primera vez.
Concluye con: INFRACCIÓN APLICABLE / NO APLICA INFRACCIÓN. Responde en español.`,
    mcpServers: [{ command: TSX, args: [MCP('regulations.server.ts')] }],
  },
  {
    id: 'resident-agent',
    label: 'Resident',
    description: 'Consulta historial de residentes y reincidencia.',
    enabled: true,
    orchestratorDescription: 'Consulta historial de incidencias de un residente por unidad o nombre. Determina si es reincidente.',
    systemPrompt: `Eres un agente de registro de residentes de una comunidad.
Consulta el historial y clasifica al residente como:
- SIN ANTECEDENTES (0 incidencias), ANTECEDENTE PREVIO (1), REINCIDENTE (2+).
Indica su estado (activo/suspendido/moroso). Responde en español.`,
    mcpServers: [{ command: TSX, args: [MCP('residents.server.ts')] }],
  },
  {
    id: 'decision-agent',
    label: 'Decision',
    description: 'Emite la resolución final: Multa, Advertencia o Desestimado.',
    enabled: true,
    orchestratorDescription: 'Toma la decisión final sobre una incidencia con base en el informe de inspección y el historial del residente.',
    systemPrompt: `Eres el agente de decisión de la comisión disciplinaria residencial.
Lógica: sin infracción → DESESTIMAR | primera vez + política warn-first → ADVERTENCIA | reincidente o multa directa → MULTA | suspendido → MULTA +50%.
Formato obligatorio: RESOLUCIÓN / Monto / Residente / Fundamento / Acción.
Registra con register_incident. Responde en español.`,
    mcpServers: [{ command: TSX, args: [MCP('residents.server.ts')] }],
  },
]
