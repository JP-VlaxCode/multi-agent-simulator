import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { readFile, writeFile, mkdir, rm } from 'fs/promises'
import { existsSync, statSync, readdirSync } from 'fs'
import { resolve, relative } from 'path'

const SANDBOX_ROOT = resolve('./sandbox')

function safePath(p: string): string {
  const resolved = resolve(SANDBOX_ROOT, p.replace(/^\//, ''))
  const rel = relative(SANDBOX_ROOT, resolved)
  if (rel.startsWith('..')) throw new Error(`Access denied: path outside sandbox — ${p}`)
  return resolved
}

// Ensure sandbox exists
if (!existsSync(SANDBOX_ROOT)) {
  await mkdir(SANDBOX_ROOT, { recursive: true })
}

// Seed some demo files
const demoFiles: Record<string, string> = {
  'reportes/resumen-mayo.txt': 'Resumen Mayo 2026\n\nVentas: $1.250.000\nGastos: $890.000\nMargen: $360.000 (28.8%)',
  'reportes/kpis-q1.txt': 'KPIs Q1 2026\n\n- NPS: 72\n- Churn: 2.1%\n- CAC: $450\n- LTV: $3.200',
  'reportes/incidentes.txt': 'Incidentes Mayo 2026\n\n1. PRD-02 caída (2h) — resuelto\n2. Lentitud base de datos (30min) — resuelto',
  'docs/onboarding.md': '# Onboarding\n\nBienvenido al equipo. Este documento describe el proceso de incorporación.',
}

for (const [filePath, content] of Object.entries(demoFiles)) {
  const full = safePath(filePath)
  await mkdir(resolve(full, '..'), { recursive: true })
  if (!existsSync(full)) await writeFile(full, content, 'utf-8')
}

const server = new McpServer({ name: 'filesystem-simulator', version: '1.0.0' })

server.tool(
  'list_directory',
  'Lista el contenido de un directorio dentro del sandbox',
  { path: z.string().default('/').describe('Ruta relativa dentro del sandbox') },
  async ({ path }) => {
    const dir = safePath(path)
    if (!existsSync(dir)) return { content: [{ type: 'text', text: `Directorio no existe: ${path}` }] }
    const entries = readdirSync(dir, { withFileTypes: true })
    const text = entries.map((e) => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`).join('\n')
    return { content: [{ type: 'text', text: text || '(vacío)' }] }
  }
)

server.tool(
  'read_file',
  'Lee el contenido de un archivo dentro del sandbox',
  { path: z.string().describe('Ruta relativa al archivo') },
  async ({ path }) => {
    const file = safePath(path)
    if (!existsSync(file)) return { content: [{ type: 'text', text: `Archivo no encontrado: ${path}` }] }
    const content = await readFile(file, 'utf-8')
    return { content: [{ type: 'text', text: content }] }
  }
)

server.tool(
  'write_file',
  'Escribe o sobreescribe un archivo dentro del sandbox',
  {
    path: z.string().describe('Ruta relativa al archivo'),
    content: z.string().describe('Contenido a escribir'),
  },
  async ({ path, content }) => {
    const file = safePath(path)
    await mkdir(resolve(file, '..'), { recursive: true })
    await writeFile(file, content, 'utf-8')
    return { content: [{ type: 'text', text: `Archivo guardado: ${path}` }] }
  }
)

server.tool(
  'delete_file',
  'Elimina un archivo del sandbox',
  { path: z.string().describe('Ruta relativa al archivo') },
  async ({ path }) => {
    const file = safePath(path)
    if (!existsSync(file)) return { content: [{ type: 'text', text: `Archivo no existe: ${path}` }] }
    await rm(file, { force: true })
    return { content: [{ type: 'text', text: `Archivo eliminado: ${path}` }] }
  }
)

server.tool(
  'create_directory',
  'Crea un directorio dentro del sandbox',
  { path: z.string().describe('Ruta del directorio a crear') },
  async ({ path }) => {
    const dir = safePath(path)
    await mkdir(dir, { recursive: true })
    return { content: [{ type: 'text', text: `Directorio creado: ${path}` }] }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
