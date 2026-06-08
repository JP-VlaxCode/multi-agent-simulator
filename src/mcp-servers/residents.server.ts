import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'

interface Incident {
  id: string
  date: string
  type: string
  description: string
  resolution: 'multa' | 'advertencia' | 'desestimado'
  amount?: number
}

interface Resident {
  unit: string
  name: string
  email: string
  phone: string
  status: 'activo' | 'suspendido' | 'moroso'
  incidents: Incident[]
}

const residents: Resident[] = [
  {
    unit: '101',
    name: 'Roberto Sánchez',
    email: 'r.sanchez@gmail.com',
    phone: '+56912111001',
    status: 'activo',
    incidents: [],
  },
  {
    unit: '205',
    name: 'Carmen López',
    email: 'carmen.lopez@empresa.com',
    phone: '+56912222205',
    status: 'activo',
    incidents: [
      {
        id: uuidv4(),
        date: '2026-03-15',
        type: 'ruido',
        description: 'Fiesta con música hasta las 03:00',
        resolution: 'advertencia',
      },
    ],
  },
  {
    unit: '305',
    name: 'Andrés Morales',
    email: 'andres.morales@hotmail.com',
    phone: '+56912333305',
    status: 'activo',
    incidents: [
      {
        id: uuidv4(),
        date: '2025-11-20',
        type: 'basura',
        description: 'Bolsas de basura en el pasillo del piso 3',
        resolution: 'advertencia',
      },
      {
        id: uuidv4(),
        date: '2026-01-08',
        type: 'estacionamiento',
        description: 'Vehículo en estacionamiento de visitas por 5 días seguidos',
        resolution: 'multa',
        amount: 25000,
      },
    ],
  },
  {
    unit: '410',
    name: 'Valentina Reyes',
    email: 'v.reyes@outlook.com',
    phone: '+56912444410',
    status: 'activo',
    incidents: [],
  },
  {
    unit: '502',
    name: 'Jorge Castillo',
    email: 'j.castillo@gmail.com',
    phone: '+56912555502',
    status: 'suspendido',
    incidents: [
      {
        id: uuidv4(),
        date: '2025-08-10',
        type: 'daños',
        description: 'Rayado de pared en hall de entrada',
        resolution: 'multa',
        amount: 50000,
      },
      {
        id: uuidv4(),
        date: '2025-10-22',
        type: 'obras',
        description: 'Obras sin autorización en terraza',
        resolution: 'multa',
        amount: 40000,
      },
      {
        id: uuidv4(),
        date: '2026-02-14',
        type: 'seguridad',
        description: 'Puerta de emergencia bloqueada con muebles',
        resolution: 'multa',
        amount: 35000,
      },
    ],
  },
  {
    unit: '601',
    name: 'Isabel Fuentes',
    email: 'isabel.fuentes@empresa.cl',
    phone: '+56912666601',
    status: 'activo',
    incidents: [
      {
        id: uuidv4(),
        date: '2026-04-01',
        type: 'mascotas',
        description: 'Perro sin correa en área de piscina',
        resolution: 'advertencia',
      },
    ],
  },
]

const server = new McpServer({ name: 'residents-simulator', version: '1.0.0' })

server.tool(
  'get_resident_history',
  'Obtiene el historial de incidencias de un residente por número de unidad',
  { unit: z.string().describe('Número de unidad/departamento (ej: 305)') },
  async ({ unit }) => {
    const r = residents.find(r => r.unit === unit)
    if (!r) return { content: [{ type: 'text', text: `Unidad ${unit} no registrada en el sistema.` }] }

    const incidentCount = r.incidents.length
    const totalFines = r.incidents.reduce((sum, i) => sum + (i.amount ?? 0), 0)
    const isRecidivist = incidentCount >= 2

    let text = `HISTORIAL RESIDENTE — Unidad ${r.unit}
Nombre: ${r.name}
Email: ${r.email}
Estado: ${r.status.toUpperCase()}
Total incidencias: ${incidentCount}
Total multas acumuladas: $${totalFines.toLocaleString()} CLP
Clasificación: ${isRecidivist ? '⚠️ REINCIDENTE' : incidentCount === 1 ? 'Antecedente previo (1 incidencia)' : 'Sin antecedentes'}\n`

    if (incidentCount > 0) {
      text += '\nHistorial detallado:\n'
      r.incidents.forEach((inc, i) => {
        text += `  ${i + 1}. [${inc.date}] ${inc.type.toUpperCase()} — ${inc.description} → ${inc.resolution.toUpperCase()}${inc.amount ? ` ($${inc.amount.toLocaleString()})` : ''}\n`
      })
    }
    return { content: [{ type: 'text', text }] }
  }
)

server.tool(
  'find_resident_by_name',
  'Busca un residente por nombre o parte del nombre',
  { name: z.string().describe('Nombre o apellido a buscar') },
  async ({ name }) => {
    const q = name.toLowerCase()
    const found = residents.filter(r => r.name.toLowerCase().includes(q))
    if (found.length === 0) return { content: [{ type: 'text', text: 'No se encontraron residentes con ese nombre.' }] }
    const text = found.map(r =>
      `Unidad ${r.unit} — ${r.name} | Estado: ${r.status} | Incidencias: ${r.incidents.length}`
    ).join('\n')
    return { content: [{ type: 'text', text }] }
  }
)

server.tool(
  'list_residents',
  'Lista todos los residentes con su estado y número de incidencias',
  {},
  async () => {
    const text = residents.map(r =>
      `Unidad ${r.unit} — ${r.name} | ${r.status.toUpperCase()} | ${r.incidents.length} incidencia(s)`
    ).join('\n')
    return { content: [{ type: 'text', text }] }
  }
)

server.tool(
  'register_incident',
  'Registra una nueva incidencia para un residente',
  {
    unit: z.string().describe('Unidad del residente'),
    type: z.string().describe('Tipo de infracción'),
    description: z.string().describe('Descripción del incidente'),
    resolution: z.enum(['multa', 'advertencia', 'desestimado']),
    amount: z.number().optional().describe('Monto de multa si aplica'),
  },
  async ({ unit, type, description, resolution, amount }) => {
    const r = residents.find(r => r.unit === unit)
    if (!r) return { content: [{ type: 'text', text: `Unidad ${unit} no encontrada.` }] }
    const incident: Incident = {
      id: uuidv4(),
      date: new Date().toISOString().split('T')[0],
      type,
      description,
      resolution,
      amount,
    }
    r.incidents.push(incident)
    return {
      content: [{
        type: 'text',
        text: `Incidencia registrada para Unidad ${unit} (${r.name}):\n[${incident.date}] ${type} — ${resolution.toUpperCase()}${amount ? ` $${amount.toLocaleString()}` : ''}`,
      }],
    }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
