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
| Message Bus | `IBus` interface → `InMemoryBus` / `RedisBus` (auto-selección) |
| Memoria | `IMemory` interface → estrategias: ShortTerm, LongTerm, Graph, Custom |
| Backend | Express v5 + Socket.io |
| Frontend | Vite + React |
| Logging | pino (structured JSON en prod, pretty en dev) |
| Resilience | Retry + Circuit Breaker para llamadas LLM |
| Config | Validación zod de env vars con fail-fast |
| Containers | Docker + Docker Compose (app + Redis + frontend) |
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
  └── InMemoryBus   ← default (EventEmitter, si no hay REDIS_URL)
  └── RedisBus      ← Pub/Sub + Streams para replay (auto-selección via bus.factory.ts)
```

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
│   ├── config/
│   │   ├── env.ts                     ← Validación zod de variables de entorno
│   │   ├── logger.ts                  ← Logger pino (pretty dev / JSON prod)
│   │   └── index.ts                   ← re-exports
│   ├── utils/
│   │   ├── retry.ts                   ← withRetry() + CircuitBreaker
│   │   ├── shutdown.ts                ← Graceful shutdown (SIGINT/SIGTERM)
│   │   └── index.ts                   ← re-exports
│   ├── agents/
│   │   ├── agent-config.ts            ← Definición de los 7 agentes
│   │   ├── agent-registry.ts          ← Lifecycle de agentes (start/stop/toggle)
│   │   ├── model.factory.ts           ← Azure VercelModel + CircuitBreaker
│   │   └── orchestrator.agent.ts      ← generateText + tools delegation + retry
│   ├── mcp-servers/
│   │   ├── email.server.ts
│   │   ├── teams.server.ts
│   │   ├── whatsapp.server.ts
│   │   ├── filesystem.server.ts
│   │   ├── residents.server.ts
│   │   ├── regulations.server.ts
│   │   └── documentation.server.ts
│   ├── bus/
│   │   ├── bus.interface.ts           ← IBus (subscribe, unsubscribeHandler)
│   │   ├── in-memory.bus.ts           ← EventEmitter (default sin Redis)
│   │   ├── redis.bus.ts               ← Redis Pub/Sub + Streams
│   │   └── bus.factory.ts             ← Auto-selección InMemory vs Redis
│   ├── memory/
│   │   ├── memory.interface.ts        ← IMemory, MemoryEntry, MemoryType
│   │   ├── memory.factory.ts          ← Auto-selección Qdrant vs JSON
│   │   ├── short-term.memory.ts       ← Sliding window in-memory
│   │   ├── long-term.memory.ts        ← JSON + embeddings + eviction (fallback)
│   │   ├── qdrant.memory.ts           ← Qdrant vector store + chunking
│   │   ├── graph.memory.ts            ← graphology (normalizado, sin self-loops)
│   │   ├── custom.memory.ts           ← Preferencias con upsert
│   │   ├── composite.memory.ts        ← Ranking ponderado cross-strategy
│   │   ├── embeddings.ts              ← getEmbedding() + cosine + retry
│   │   ├── entity-extractor.ts        ← LLM entity extraction + regex fallback
│   │   └── hooks/
│   │       ├── memory-enrichment.hook.ts  ← RAG: prepend context antes de invoke
│   │       └── memory-persistence.hook.ts ← Persiste resultado en 3 capas
│   ├── types/
│   │   └── index.ts                   ← AgentId, BusMessage, MemoryEntry, etc.
│   ├── server.ts                      ← Express + Socket.io + shutdown hooks
│   └── cli.ts                         ← CLI interactivo (modo terminal)
├── frontend/
│   ├── src/
│   │   ├── App.tsx                    ← estado principal + Socket.io
│   │   └── components/
│   │       ├── TaskInput.tsx
│   │       ├── AgentFlow.tsx
│   │       ├── GraphCanvas.tsx
│   │       ├── MemoryView.tsx
│   │       └── ResultPanel.tsx
│   ├── index.html
│   ├── Dockerfile                     ← nginx + SPA routing
│   ├── vite.config.ts
│   └── package.json
├── data/                              ← long-term.json, graph.json, preferences.json
├── sandbox/                           ← archivos accesibles por FilesAgent
├── docs/                              ← documentación + roadmap
├── logs/                              ← audit trail JSON por sesión
├── Dockerfile                         ← Container del backend (para deploy)
├── docker-compose.yml                 ← Solo infraestructura: Redis + Qdrant
├── .dockerignore
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
```bash
# Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://tu-recurso.openai.azure.com/openai
AZURE_OPENAI_API_KEY=tu-api-key
AZURE_OPENAI_DEPLOYMENT=gpt-5.4-mini
AZURE_API_VERSION=2024-04-01-preview

# Embeddings (opcional — sin esto, long-term memory cae a búsqueda por texto)
AZURE_EMBEDDING_ENDPOINT=https://tu-recurso.openai.azure.com/openai/deployments/text-embedding-3-small
AZURE_EMBEDDING_API_KEY=tu-embedding-key

# Server
PORT=3010
NODE_ENV=development
LOG_LEVEL=info

# Infraestructura (apunta a los containers de docker-compose)
REDIS_URL=redis://localhost:6381
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=agent-memory
```

> Variables validadas con zod al startup. Si falta algo crítico, el proceso falla con error descriptivo.
> Si `REDIS_URL` no está → usa InMemoryBus. Si `QDRANT_URL` no está → usa JSON file.

### 2. Instalar dependencias
```bash
npm install --legacy-peer-deps
cd frontend && npm install && cd ..
```

### 3. Levantar infraestructura (Docker)

El `docker-compose.yml` solo contiene las bases de datos. La app y el frontend corren en terminal.

```bash
docker compose up -d
```

Esto levanta:

| Servicio | Puerto host | Descripción |
|----------|-------------|-------------|
| Redis    | `localhost:6381` | Bus de mensajes (Pub/Sub + Streams) |
| Qdrant   | `localhost:6333` | Vector store para memoria semántica |

Verificar que están healthy:
```bash
docker compose ps
```

### 4. Correr la aplicación (terminal)

| Comando | Descripción |
|---|---|
| `npm run dev` | Backend (:3010) + Frontend Vite (:5173) simultáneamente |
| `npm run server` | Solo el backend con Socket.io |
| `npm run cli` | CLI interactivo en terminal (sin frontend) |
| `npm run typecheck` | Type check sin emitir |
| `npm run build` | Compilar TypeScript a `./dist` |

Workflow típico:
```bash
# Terminal 1: infraestructura
docker compose up -d

# Terminal 2: app completa
npm run dev
```

El backend se conecta automáticamente a Redis y Qdrant si están disponibles. Si Docker no está corriendo, el sistema funciona igualmente con InMemoryBus y JSON-based memory (modo degradado).

### 5. Endpoints disponibles

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/health` | GET | Status detallado (agents, bus, memory, metrics) |
| `/task` | POST | Ejecutar tarea `{ "task": "..." }` |
| `/agents` | GET | Estado de todos los agentes |
| `/agents/:id/toggle` | POST | Encender/apagar un agente |
| `/metrics` | GET | Métricas del sistema (latencia, errores, tokens) |
| `/memory` | GET | Contenido de todas las capas de memoria |
| `/memory/graph-data` | GET | Nodos y aristas del knowledge graph |
| `/dlq` | GET | Dead letter queue (mensajes fallidos) |
| `/dlq/:msgId` | DELETE | Remover mensaje de la DLQ |
| `/dlq` | DELETE | Vaciar la DLQ |

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

### Agregar un nuevo agente especialista
1. Crear `src/mcp-servers/nuevo.server.ts` con las tools MCP
2. Agregar config en `src/agents/agent-config.ts` (seguir patrón existente)
3. Agregar el ID al union type en `src/types/index.ts`
4. Reiniciar — el registry arranca automáticamente todos los `enabled: true`

### Reemplazar la memoria long-term por un vector DB
```typescript
// src/memory/qdrant.memory.ts
export class QdrantMemory implements IMemory { ... }

// En cli.ts o server.ts:
const memory = new CompositeMemory({
  shortTerm: new ShortTermMemory(50),
  longTerm: new QdrantMemory(qdrantClient),  // ← swap aquí
  graph: new GraphMemory(),
  custom: new CustomMemory(),
})
```

### El bus Redis ya está implementado
Se selecciona automáticamente si `REDIS_URL` está en el `.env`. Si Redis no está disponible, cae a InMemoryBus.
Los mensajes se persisten en un Redis Stream (máx 10k entries) para replay y debugging.

---

## Notas técnicas

- **Strands SDK**: usa `systemPrompt` (no `system`) en `AgentConfig`
- **AI SDK v6**: `tool()` usa `inputSchema` (no `parameters`); `maxSteps` se reemplaza por `stopWhen: stepCountIs(n)`
- **Zod**: el proyecto requiere zod v4 (por Strands 1.4); instalar con `--legacy-peer-deps`
- **MCP servers**: cada servidor corre como subproceso stdio (`tsx src/mcp-servers/xxx.server.ts`)
- **Sandbox**: el FileSystem simulator restringe todas las operaciones a `./sandbox/` — error si se intenta escapar
- **Logging**: pino con JSON en producción, pretty-print en desarrollo. Child loggers con `{ component, correlationId }`
- **Circuit Breaker**: se abre tras 5 fallos consecutivos a Azure OpenAI, reset tras 60s
- **Retry**: exponential backoff (base 2s, max 30s) con jitter. No retries en errores 400/content_filter
- **Graceful Shutdown**: SIGINT/SIGTERM → cierra HTTP, detiene agentes, desconecta Redis
- **Memory**: lazy loading con Promise compartido (race-safe), eviction de 500 entries en long-term, normalización de entidades en graph
