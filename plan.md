# Plan: Multi-Agent Simulator System

## Objetivo

POC de un sistema multi-agente donde un **Agente Orquestador** delega tareas a agentes especialistas. Cada agente se conecta a **servicios simulados expuestos como servidores MCP**. Las capas están desacopladas por interfaces para facilitar reemplazos futuros (bus, memoria, simuladores). Incluye un **frontend React pequeño** que muestra la interacción en tiempo real.

---

## Tech Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node.js + TypeScript |
| Agent Framework | `@strands-agents/sdk` v1.4 (TypeScript) |
| LLM Provider | Azure OpenAI via `@ai-sdk/azure` + Vercel AI SDK v6 |
| Tool Protocol | MCP — cada simulador es un servidor MCP (stdio) |
| Message Bus | `IBus` interface → `InMemoryBus` (EventEmitter) — swappable |
| Memoria | `IMemory` interface → estrategias: ShortTerm, LongTerm, Graph, Custom |
| Backend | Express v5 + Socket.io |
| Frontend | Vite + React |
| Dev runner | `tsx` + `concurrently` |

---

## Arquitectura

```
Usuario
  │
  ▼
OrchestratorAgent (ai SDK generateText + tools delegation)
  │
  ├──[IBus]──► EmailAgent          → McpClient → email.server.ts
  ├──[IBus]──► CommunicationAgent  → McpClient → teams.server.ts + whatsapp.server.ts
  ├──[IBus]──► FilesAgent          → McpClient → filesystem.server.ts (sandbox: ./sandbox/)
  └──[IBus]──► DocumentationAgent  → McpClient → documentation.server.ts
                    ↑
              escucha broadcast
              (audita todo)

Socket.io Bridge ──► Frontend React (eventos en tiempo real)
```

---

## Capas de Abstracción

### Bus (`src/bus/`)
Todos los agentes se comunican exclusivamente a través de `IBus`. Nunca dependen de la implementación concreta.

```
IBus (interface)
  └── InMemoryBus   ← default (EventEmitter)
  └── RedisBus      ← reemplazable sin tocar agentes
  └── RabbitMqBus   ← reemplazable sin tocar agentes
```

Estructura del mensaje:
```typescript
BusMessage = {
  id, from, to, type: TASK|RESULT|ERROR|LOG,
  payload, timestamp, correlationId?
}
```

### Memoria (`src/memory/`)
Cada agente recibe una instancia de `IMemory`. Por defecto se usa `CompositeMemory` que orquesta cuatro estrategias:

| Estrategia | Clase | Almacenamiento | Uso |
|---|---|---|---|
| Short-term | `ShortTermMemory` | In-memory (sliding window) | Últimas 50 interacciones de la sesión |
| Long-term | `LongTermMemory` | `./data/long-term.json` + embeddings Azure | Persistencia entre sesiones, búsqueda semántica |
| Graph | `GraphMemory` | `./data/graph.json` (graphology) | Entidades y relaciones (personas, servicios) |
| Custom | `CustomMemory` | `./data/preferences.json` | Preferencias y personalizaciones |

Los hooks de memoria enriquecen cada invocación con contexto relevante:
- `MemoryEnrichmentHook` → prepend contexto de long-term + graph antes de invoke
- `MemoryPersistenceHook` → persiste resultado y extrae entidades tras invoke

### Servidores MCP (`src/mcp-servers/`)
Cada simulador es un proceso stdio usando `McpServer` de `@modelcontextprotocol/sdk`:

| Servidor | Tools |
|---|---|
| `email.server.ts` | `read_inbox`, `get_email`, `search_emails`, `send_email` |
| `teams.server.ts` | `list_channels`, `read_channel`, `send_message` |
| `whatsapp.server.ts` | `get_contacts`, `read_chat`, `send_message` |
| `filesystem.server.ts` | `list_directory`, `read_file`, `write_file`, `delete_file`, `create_directory` |
| `documentation.server.ts` | `log_event`, `get_audit_trail`, `save_doc`, `query_docs`, `generate_report` |

El `filesystem.server.ts` es sandboxed: todas las rutas se validan contra `./sandbox/`.

---

## Estructura de Archivos

```
simulator-agent/
├── src/
│   ├── agents/
│   │   ├── model.factory.ts           ← Azure VercelModel singleton
│   │   ├── orchestrator.agent.ts      ← generateText + tools delegation via bus
│   │   ├── email.agent.ts
│   │   ├── communication.agent.ts
│   │   ├── files.agent.ts
│   │   └── documentation.agent.ts
│   ├── mcp-servers/
│   │   ├── email.server.ts
│   │   ├── teams.server.ts
│   │   ├── whatsapp.server.ts
│   │   ├── filesystem.server.ts
│   │   └── documentation.server.ts
│   ├── bus/
│   │   ├── bus.interface.ts           ← IBus
│   │   └── in-memory.bus.ts
│   ├── memory/
│   │   ├── memory.interface.ts        ← IMemory, MemoryEntry, MemoryType
│   │   ├── short-term.memory.ts
│   │   ├── long-term.memory.ts        ← JSON + Azure embeddings + cosine similarity
│   │   ├── graph.memory.ts            ← graphology
│   │   ├── custom.memory.ts
│   │   ├── composite.memory.ts        ← orquesta todas las estrategias
│   │   ├── embeddings.ts              ← getEmbedding() + cosineSimilarity()
│   │   └── hooks/
│   │       ├── memory-enrichment.hook.ts
│   │       └── memory-persistence.hook.ts
│   ├── types/
│   │   └── index.ts                   ← AgentId, BusMessage, MemoryEntry, etc.
│   ├── server.ts                      ← Express + Socket.io (modo web)
│   └── cli.ts                         ← CLI interactivo (modo terminal)
├── frontend/
│   ├── src/
│   │   ├── App.tsx                    ← estado principal + Socket.io
│   │   └── components/
│   │       ├── TaskInput.tsx          ← input + ejemplos
│   │       ├── AgentFlow.tsx          ← feed de eventos en tiempo real
│   │       └── ResultPanel.tsx        ← respuesta final
│   ├── index.html
│   ├── vite.config.ts                 ← proxy /task → :3000
│   └── package.json
├── data/                              ← long-term.json, graph.json, preferences.json
├── sandbox/                           ← archivos accesibles por FilesAgent
│   └── reportes/                      ← archivos de demo pre-poblados
├── docs/                              ← documentación generada por DocumentationAgent
├── logs/                              ← audit trail JSON por sesión
├── plan.md                            ← este archivo
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Setup

### 1. Variables de entorno
```bash
cp .env.example .env
```
Editar `.env`:
```
AZURE_RESOURCE_NAME=tu-recurso-azure
AZURE_API_KEY=tu-api-key
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_EMBEDDING_DEPLOYMENT=text-embedding-3-small
PORT=3000
```

> `AZURE_EMBEDDING_DEPLOYMENT` es opcional. Si no está configurado, la memoria long-term cae a búsqueda por texto simple.

### 2. Instalar dependencias
```bash
npm install --legacy-peer-deps
cd frontend && npm install && cd ..
```

### 3. Correr

| Comando | Descripción |
|---|---|
| `npm run dev` | Backend (:3000) + Frontend Vite (:5173) simultáneamente |
| `npm run server` | Solo el backend con Socket.io |
| `npm run cli` | CLI interactivo en terminal (sin frontend) |

---

## Flujo de una tarea (ejemplo)

```
Usuario: "Resume los archivos de /reportes y envía el resumen por WhatsApp a +56912345678"

1. OrchestratorAgent recibe el input
2. LLM analiza → decide llamar files_agent y communication_agent
3. Publica TASK en bus para files-agent (correlationId: abc-123)
4. FilesAgent recibe TASK → Strands invoke → MCP filesystem.server.ts
   → list_directory("/reportes") + read_file(cada archivo)
   → RESULT con contenido de archivos
5. CommunicationAgent recibe TASK → Strands invoke → MCP whatsapp.server.ts
   → send_message("+56912345678", resumen)
   → RESULT confirmación
6. Orchestrator recibe ambos RESULT via correlationId
7. LLM sintetiza respuesta final
8. DocumentationAgent loggeó todos los eventos (escucha broadcast)
9. ./logs/audit-YYYY-MM-DD.json actualizado
```

---

## Cómo extender

### Reemplazar el bus por Redis
```typescript
// src/bus/redis.bus.ts
export class RedisBus implements IBus { ... }

// src/server.ts — cambiar una línea:
const bus = new RedisBus(redisClient)  // en lugar de new InMemoryBus()
```

### Agregar un nuevo agente especialista
1. Crear `src/mcp-servers/nuevo.server.ts` con las tools MCP
2. Crear `src/agents/nuevo.agent.ts` usando el patrón de los existentes
3. Registrar en `src/server.ts` y `src/cli.ts`
4. Agregar tool en `orchestrator.agent.ts`

### Reemplazar la memoria long-term por un vector DB
```typescript
// src/memory/pinecone.memory.ts
export class PineconeMemory implements IMemory { ... }

// En CompositeMemory config:
longTerm: new PineconeMemory(pineconeClient)
```

---

## Notas técnicas

- **Strands SDK**: usa `systemPrompt` (no `system`) en `AgentConfig`
- **AI SDK v6**: `tool()` usa `inputSchema` (no `parameters`); `maxSteps` se reemplaza por `stopWhen: stepCountIs(n)`
- **Zod**: el proyecto requiere zod v4 (por Strands 1.4); instalar con `--legacy-peer-deps`
- **MCP servers**: cada servidor corre como subproceso stdio (`tsx src/mcp-servers/xxx.server.ts`)
- **Sandbox**: el FileSystem simulator restringe todas las operaciones a `./sandbox/` — error si se intenta escapar
