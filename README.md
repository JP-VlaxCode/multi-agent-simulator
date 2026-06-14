# Multi-Agent Simulator

Sistema multi-agente con orquestación inteligente, memoria semántica y comunicación por bus de eventos. Un orquestador delega tareas a agentes especialistas que interactúan con servicios simulados vía MCP (Model Context Protocol).

## Arquitectura

```
Usuario (CLI / Frontend / API)
  │
  ▼
┌─────────────────────────────────────────────────────────┐
│  OrchestratorAgent (Vercel AI SDK + tool calling)       │
│  ── Analiza la tarea → delega a agentes correctos ──   │
└────────────┬────────────────────────────────────────────┘
             │ IBus (Redis Pub/Sub / InMemory)
             ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐
│ Email  │ │ Comms  │ │ Files  │ │ Inspect│ │ Decision │
│ Agent  │ │ Agent  │ │ Agent  │ │ Agent  │ │  Agent   │
└───┬────┘ └───┬────┘ └───┬────┘ └───┬────┘ └────┬─────┘
    │          │          │          │            │
    ▼          ▼          ▼          ▼            ▼
  MCP        MCP        MCP        MCP          MCP
 Server     Server     Server     Server       Server
(email)  (teams+wa) (filesystem)(regulations)(residents)
```

### Componentes principales

| Capa | Descripción |
|------|-------------|
| **Orquestador** | Recibe tareas, construye tools dinámicamente y delega vía bus |
| **Agentes** | 7 especialistas con Strands SDK + MCP tools |
| **Bus** | Redis Pub/Sub + Streams (fallback: EventEmitter in-memory) |
| **Memoria** | Composite: short-term, Qdrant vector, knowledge graph, preferencias |
| **MCP Servers** | Servicios simulados como procesos stdio |

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Agent Framework:** `@strands-agents/sdk`
- **LLM:** Azure OpenAI (Vercel AI SDK)
- **Vector Store:** Qdrant
- **Message Bus:** Redis (ioredis)
- **Backend:** Express + Socket.io
- **Frontend:** React + Vite
- **Logging:** pino (structured JSON)

## Quick Start

### 1. Clonar e instalar

```bash
git clone <repo-url>
cd simulator-agent
npm install --legacy-peer-deps
cd frontend && npm install && cd ..
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `.env` con tus credenciales de Azure OpenAI.

### 3. Levantar infraestructura

```bash
docker compose up -d
```

Esto inicia Redis (`:6381`) y Qdrant (`:6333`).

### 4. Ejecutar

```bash
npm run dev        # Backend (:3010) + Frontend (:5173)
```

O en modo CLI:

```bash
npm run cli
```

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Backend + Frontend simultáneamente |
| `npm run server` | Solo backend |
| `npm run frontend` | Solo frontend |
| `npm run cli` | CLI interactivo |
| `npm run typecheck` | Verificación de tipos |
| `npm run build` | Compilar a `./dist` |

## API

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/task` | POST | Ejecutar tarea `{ "task": "..." }` |
| `/health` | GET | Status del sistema |
| `/agents` | GET | Estado de los agentes |
| `/agents/:id/toggle` | POST | Encender/apagar agente |
| `/metrics` | GET | Métricas (latencia, errores, tokens) |
| `/memory` | GET | Contenido de memoria |
| `/memory/graph-data` | GET | Knowledge graph (nodos + aristas) |
| `/dlq` | GET | Dead letter queue |

## Agentes

| Agente | Función | MCP Server |
|--------|---------|------------|
| `email-agent` | Leer, buscar y enviar correos | `email.server.ts` |
| `communication-agent` | Mensajería Teams + WhatsApp | `teams.server.ts`, `whatsapp.server.ts` |
| `files-agent` | Operaciones en sandbox | `filesystem.server.ts` |
| `documentation-agent` | Auditoría y reportes | `documentation.server.ts` |
| `inspection-agent` | Evaluar infracciones | `regulations.server.ts` |
| `resident-agent` | Historial de residentes | `residents.server.ts` |
| `decision-agent` | Resolución final | `residents.server.ts` |

## Memoria

Sistema de memoria compuesto con 4 estrategias:

```
CompositeMemory
  ├── ShortTerm   → In-memory sliding window (sesión actual)
  ├── LongTerm    → Qdrant vector store (búsqueda semántica)
  ├── Graph       → Knowledge graph con entity resolution
  └── Custom      → Preferencias persistentes (upsert por key)
```

**Features:**
- Hybrid search (vector similarity + keyword fallback)
- Chunking inteligente (~500 chars por fragmento)
- Context window management (máx 2000 chars inyectados)
- Entity resolution y temporal decay en el graph
- TTL/compaction para entries antiguas

## Resiliencia

- **Retry** con exponential backoff para llamadas a Azure OpenAI
- **Circuit breaker** (abre tras 5 fallos, reset 60s)
- **Dead letter queue** para mensajes que no pudieron procesarse
- **Backpressure** configurable por agente
- **Graceful shutdown** (SIGINT/SIGTERM → cleanup ordenado)
- **Timeouts** configurables por agente

## Estructura del proyecto

```
src/
├── config/          # Validación env (zod), logger (pino)
├── utils/           # Retry, circuit breaker, metrics, shutdown
├── bus/             # IBus, InMemoryBus, RedisBus, DLQ, factory
├── memory/          # IMemory, Qdrant, Graph, Composite, hooks
├── agents/          # Registry, Orchestrator, config, model factory
├── mcp-servers/     # 7 servidores MCP simulados
├── types/           # TypeScript types compartidos
├── server.ts        # Express + Socket.io
└── cli.ts           # REPL interactivo
```

## Modo degradado

El sistema funciona sin Docker (sin Redis ni Qdrant):
- Bus → InMemoryBus (EventEmitter)
- LongTerm → JSON file con embeddings
- Todo sigue operativo, solo pierde persistencia distribuida

## Licencia

MIT
