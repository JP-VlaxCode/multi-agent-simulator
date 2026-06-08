import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

interface Violation {
  code: string
  category: string
  description: string
  fineAmount: number      // CLP
  warnFirst: boolean      // primera vez solo se advierte?
  severity: 'low' | 'medium' | 'high'
  legalBasis: string
}

const VIOLATIONS: Violation[] = [
  {
    code: 'RES-001',
    category: 'ruido',
    description: 'Ruido excesivo en horario de silencio (22:00–08:00)',
    fineAmount: 30000,
    warnFirst: true,
    severity: 'medium',
    legalBasis: 'Art. 12 Reglamento de Copropiedad',
  },
  {
    code: 'RES-002',
    category: 'basura',
    description: 'Depósito de basura en zonas comunes fuera de los contenedores',
    fineAmount: 20000,
    warnFirst: false,
    severity: 'medium',
    legalBasis: 'Art. 18 Reglamento de Copropiedad',
  },
  {
    code: 'RES-003',
    category: 'mascotas',
    description: 'Mascotas sueltas en áreas comunes sin correa o sin bozal (razas peligrosas)',
    fineAmount: 15000,
    warnFirst: true,
    severity: 'low',
    legalBasis: 'Art. 21 Reglamento de Copropiedad',
  },
  {
    code: 'RES-004',
    category: 'estacionamiento',
    description: 'Vehículo estacionado en zona prohibida o en espacio ajeno',
    fineAmount: 25000,
    warnFirst: false,
    severity: 'medium',
    legalBasis: 'Art. 9 Reglamento de Copropiedad',
  },
  {
    code: 'RES-005',
    category: 'daños',
    description: 'Daño a infraestructura o bienes comunes del edificio',
    fineAmount: 50000,
    warnFirst: false,
    severity: 'high',
    legalBasis: 'Art. 24 Reglamento de Copropiedad',
  },
  {
    code: 'RES-006',
    category: 'obras',
    description: 'Obras o modificaciones no autorizadas en unidad o zonas comunes',
    fineAmount: 40000,
    warnFirst: false,
    severity: 'high',
    legalBasis: 'Art. 15 Reglamento de Copropiedad',
  },
  {
    code: 'RES-007',
    category: 'uso_indebido',
    description: 'Uso indebido de áreas comunes (piscina, quincho, sala de eventos) fuera de horario',
    fineAmount: 20000,
    warnFirst: true,
    severity: 'low',
    legalBasis: 'Art. 11 Reglamento de Copropiedad',
  },
  {
    code: 'RES-008',
    category: 'seguridad',
    description: 'Dejar puertas de acceso o emergencia abiertas o bloqueadas',
    fineAmount: 35000,
    warnFirst: false,
    severity: 'high',
    legalBasis: 'Art. 8 Reglamento de Copropiedad',
  },
]

const server = new McpServer({ name: 'regulations-simulator', version: '1.0.0' })

server.tool(
  'list_violation_types',
  'Lista todos los tipos de infracciones con sus montos de multa',
  {},
  async () => {
    const text = VIOLATIONS.map(v =>
      `[${v.code}] ${v.category.toUpperCase()} — ${v.description} | Multa: $${v.fineAmount.toLocaleString()} | Severidad: ${v.severity} | Primera vez: ${v.warnFirst ? 'solo advertencia' : 'multa directa'}`
    ).join('\n')
    return { content: [{ type: 'text', text }] }
  }
)

server.tool(
  'check_violation',
  'Determina si una descripción de incidente constituye una infracción y cuál aplica',
  {
    description: z.string().describe('Descripción del incidente o conducta a evaluar'),
  },
  async ({ description }) => {
    const desc = description.toLowerCase()
    const matched = VIOLATIONS.filter(v =>
      desc.includes(v.category) ||
      v.description.toLowerCase().split(' ').some(word => word.length > 4 && desc.includes(word))
    )

    if (matched.length === 0) {
      return {
        content: [{ type: 'text', text: 'No se encontró una infracción aplicable en el reglamento para la conducta descrita. Se recomienda desestimar.' }],
      }
    }

    const best = matched.sort((a, b) => b.fineAmount - a.fineAmount)[0]
    const text = `INFRACCIÓN DETECTADA:
Código: ${best.code}
Categoría: ${best.category}
Descripción reglamentaria: ${best.description}
Monto de multa: $${best.fineAmount.toLocaleString()} CLP
Severidad: ${best.severity}
Base legal: ${best.legalBasis}
Política primera vez: ${best.warnFirst ? 'Primera infracción → solo advertencia formal' : 'Multa directa independiente del historial'}`
    return { content: [{ type: 'text', text }] }
  }
)

server.tool(
  'get_fine_amount',
  'Obtiene el monto exacto de multa para un código de infracción',
  { code: z.string().describe('Código de infracción (ej: RES-002)') },
  async ({ code }) => {
    const v = VIOLATIONS.find(v => v.code === code)
    if (!v) return { content: [{ type: 'text', text: `Código ${code} no encontrado en el reglamento.` }] }
    return { content: [{ type: 'text', text: `Multa para ${v.code} (${v.category}): $${v.fineAmount.toLocaleString()} CLP — ${v.legalBasis}` }] }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
