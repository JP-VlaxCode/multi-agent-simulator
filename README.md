# Multi-Agent Simulator

Sistema multi-agente en TypeScript donde un **Agente Orquestador** analiza una tarea en lenguaje natural y la delega a **agentes especialistas**. Cada especialista accede a servicios (email, mensajería, archivos, reglamento, residentes…) expuestos como **servidores MCP**.

Las capas (bus de mensajes, memoria, simuladores MCP, agentes) están desacopladas por interfaces, de modo que el sistema se puede **embeber en otros productos** o adaptar reemplazando piezas concretas sin tocar el resto.

```
Usuario / Sistema externo
        │  (texto en lenguaje natural)
        ▼
  OrchestratorAgent ──[IBus]──► agentes especialistas ──► McpClient ──► servidor MCP (servicio)
        │                                                         (stdio subprocess)
        └── sintetiza una respuesta final
```

---

## Tabla de contenidos

- [¿Qué resuelve?](#qué-resuelve)
- [Quickstart](#quickstart)
- [Formas de integrarlo](#formas-de-integrarlo)
  - [1. API HTTP (REST + Socket.io)](#1-api-http-rest--socketio)
  - [2. Como librería / módulo embebido](#2-como-librería--módulo-embebido)
  - [3. CLI](#3-cli)
- [Configuración](#configuración)
- [Agentes incluidos](#agentes-incluidos)
- [Ejemplo de extremo a extremo: workflow residencial](#ejemplo-de-extremo-a-extremo-workflow-residencial)
- [Puntos de extensión](#puntos-de-extensión)
- [Referencia de la API HTTP](#referencia-de-la-api-http)
- [Eventos Socket.io](#eventos-socketio)
- [Notas técnicas](#notas-técnicas)

---

## ¿Qué resuelve?

Permite exponer una capacidad de **orquestación de agentes con herramientas** detrás de una sola entrada de texto. Un producto host envía una instrucción (ej. *"Resume los reportes de /reportes y avisa por WhatsApp al +569..."*) y el sistema:

1. Decide qué agentes especialistas intervienen.
2. Los ejecuta (en paralelo cuando aplica) vía un bus de mensajes.
3. Cada agente usa sus tools MCP contra el servicio correspondiente.
4. Devuelve una respuesta final sintetizada, y opcionalmente emite eventos en tiempo real de todo el flujo.

Pensado como base reutilizable: el bus, la memoria y los simuladores son interfaces, por lo que puedes cambiar `InMemoryBus` por Redis, la memoria long-term por un vector DB, o un servidor MCP simulado por uno real, sin reescribir los agentes.

---

## Quickstart

Requisitos: Node.js 20+, un recurso de Azure OpenAI (modelo de texto; embeddings opcional).

```bash
# 1. Configurar credenciales
cp .env.example .env
#   editar .env con tu endpoint, api key y deployment de Azure

# 2. Instalar dependencias (raíz requiere --legacy-peer-deps por zod v4 / Strands)
npm install --legacy-peer-deps
cd frontend && npm install && cd ..

# 3. Ejecutar
npm run dev      # backend (:PORT) + frontend Vite (:5173)
# o por separado:
npm run server   # solo backend HTTP + Socket.io
npm run cli      # CLI interactivo en terminal (sin frontend)
```

| Comando | Descripción |
|---|---|
| `npm run dev` | Backend + frontend simultáneamente (`concurrently`) |
| `npm run server` | Solo el backend (Express + Socket.io) |
| `npm run cli` | Bucle interactivo en terminal |
| `npm run build` | Compila TypeScript (`tsc`) |

---

## Formas de integrarlo

Hay tres maneras de consumir el sistema desde otro desarrollo. La **API HTTP** es la vía recomendada para integrar desde otro producto/servicio.

### 1. API HTTP (REST + Socket.io)

Levanta el servidor (`npm run server`) y consúmelo desde cualquier lenguaje. El endpoint principal es síncrono: recibe una tarea y devuelve el resultado final.

```bash
curl -X POST http://localhost:3010/task \
  -H 'Content-Type: application/json' \
  -d '{"task": "Lee mi bandeja de entrada y dime qué correos son urgentes"}'
# → { "result": "Tienes 2 correos urgentes: ..." }
```

Desde JavaScript/TypeScript:

```typescript
const res = await fetch('http://localhost:3010/task', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ task: 'Resume los reportes y avísame por Teams' }),
})
const { result } = await res.json()
```

Para ver el flujo paso a paso en tiempo real (qué agente recibe qué, resultados parciales), suscríbete a Socket.io en paralelo — ver [Eventos Socket.io](#eventos-socketio).

> Nota: `/task` es bloqueante hasta que el orquestador termina. Cada delegación tiene un timeout interno de 120 s por agente.

### 2. Como librería / módulo embebido

Si tu host también es Node/TS, puedes instanciar el núcleo directamente y saltarte HTTP. El patrón es el mismo que usan `src/server.ts` y `src/cli.ts`:

```typescript
import { InMemoryBus } from './src/bus/in-memory.bus.js'
import { CompositeMemory } from './src/memory/composite.memory.js'
import { ShortTermMemory } from './src/memory/short-term.memory.js'
import { LongTermMemory } from './src/memory/long-term.memory.js'
import { GraphMemory } from './src/memory/graph.memory.js'
import { CustomMemory } from './src/memory/custom.memory.js'
import { AgentRegistry } from './src/agents/agent-registry.js'
import { OrchestratorAgent } from './src/agents/orchestrator.agent.js'

const bus = new InMemoryBus()
const memory = new CompositeMemory({
  shortTerm: new ShortTermMemory(50),
  longTerm:  new LongTermMemory(),
  graph:     new GraphMemory(),
  custom:    new CustomMemory(),
})

const registry = new AgentRegistry(bus, memory)
const orchestrator = new OrchestratorAgent(bus, registry)
await registry.startAll()

const result = await orchestrator.runTask('Tu tarea aquí')
```

Ventaja: tienes acceso directo al `bus` (para suscribirte a eventos), al `registry` (para encender/apagar agentes en caliente) y a `memory`.

### 3. CLI

Para pruebas o uso interactivo en terminal: `npm run cli`. Comandos dentro del prompt: escribe la tarea, `agentes` para ver el estado, `salir` para terminar.

---

## Configuración

Variables de entorno (`.env`):

| Variable | Requerida | Descripción |
|---|---|---|
| `AZURE_OPENAI_ENDPOINT` | ✅ | URL base del recurso Azure OpenAI (sin `/responses` ni `?api-version`) |
| `AZURE_OPENAI_API_KEY` | ✅ | API key del modelo de texto |
| `AZURE_OPENAI_DEPLOYMENT` | ✅ | Nombre del deployment del modelo de texto (ej. `gpt-5.4-mini`) |
| `AZURE_API_VERSION` | — | Default `2024-04-01-preview` |
| `AZURE_EMBEDDING_ENDPOINT` | — | URL del deployment de embeddings (memoria semántica) |
| `AZURE_EMBEDDING_API_KEY` | — | API key de embeddings |
| `AZURE_EMBEDDING_API_VERSION` | — | Default `2023-05-15` |
| `PORT` | — | Puerto del backend HTTP (default `3000`) |

> Si no configuras el deployment de embeddings, la memoria long-term degrada a búsqueda por texto simple en lugar de búsqueda semántica.

---

## Agentes incluidos

Definidos en `src/agents/agent-config.ts`. Cada uno se enciende según `enabled` y el orquestador sólo ve a los que están corriendo.

| Agente (`id`) | Rol | Servidor(es) MCP |
|---|---|---|
| `email-agent` | Leer bandeja, buscar y enviar correos | `email.server.ts` |
| `communication-agent` | Mensajería Teams + WhatsApp | `teams.server.ts`, `whatsapp.server.ts` |
| `files-agent` | Archivos dentro del sandbox (`./sandbox/`) | `filesystem.server.ts` |
| `documentation-agent` | Auditoría/logs/reportes — escucha *todos* los eventos del bus | `documentation.server.ts` |
| `inspection-agent` | Determina si una incidencia es infracción del reglamento | `regulations.server.ts` |
| `resident-agent` | Historial y reincidencia de residentes | `residents.server.ts` |
| `decision-agent` | Resolución final (multa / advertencia / desestimar) | `residents.server.ts` |

Los tres últimos componen un **workflow de cumplimiento residencial**: ante una incidencia, el orquestador llama `inspection-agent` + `resident-agent` en paralelo y luego pasa ambos resultados a `decision-agent`.

`documentation-agent` usa `broadcastListener: true`: registra automáticamente cada mensaje que circula por el bus (audit trail en `./logs/`).

---

## Ejemplo de extremo a extremo: workflow residencial

Este es el caso completo del **workflow de cumplimiento residencial**, desde la petición del host hasta la resolución final, usando datos que ya vienen pre-cargados en los simuladores (`regulations.server.ts` y `residents.server.ts`).

### Petición

Un host (portal de administración, conserjería, etc.) envía una incidencia en lenguaje natural:

```bash
curl -X POST http://localhost:3010/task \
  -H 'Content-Type: application/json' \
  -d '{"task": "Un vecino reporta que en el departamento 502 hicieron una fiesta con música fuerte hasta las 03:00. Evalúa el caso y resuelve."}'
```

### Qué ocurre por dentro

El orquestador detecta que es una incidencia residencial y aplica su política: llama a `inspection_agent` y `resident_agent` **en paralelo** y luego pasa ambos informes a `decision_agent`.

```
POST /task
  │
  ▼
orchestrator  ──TASK──►  inspection_agent ─┐   (en paralelo)
              ──TASK──►  resident_agent   ─┘
                              │
        ┌─────────────────────┴─────────────────────┐
        ▼                                             ▼
  check_violation(...)                        get_resident_history("502")
  vía regulations.server                      vía residents.server
        │                                             │
        ▼                                             ▼
  RES-001 · ruido                             Jorge Castillo · SUSPENDIDO
  $30.000 · Art. 12                           3 incidencias · REINCIDENTE
        └─────────────────────┬─────────────────────┘
                              ▼
              orchestrator ──TASK──► decision_agent
                                          │
                              aplica lógica de resolución
                              + register_incident(...)
                                          │
                                          ▼
                            orchestrator sintetiza respuesta final
```

**1 — `inspection_agent`** consulta `check_violation` con la descripción. El reglamento la clasifica como infracción de ruido:

```
INFRACCIÓN DETECTADA
Código: RES-001  ·  Categoría: ruido
Descripción: Ruido excesivo en horario de silencio (22:00–08:00)
Monto base: $30.000 CLP  ·  Severidad: medium
Base legal: Art. 12 Reglamento de Copropiedad
Política primera vez: solo advertencia formal
```

**2 — `resident_agent`** consulta `get_resident_history("502")`:

```
HISTORIAL RESIDENTE — Unidad 502
Nombre: Jorge Castillo  ·  Estado: SUSPENDIDO
Total incidencias: 3  ·  Multas acumuladas: $125.000 CLP
Clasificación: ⚠️ REINCIDENTE
  1. [2025-08-10] DAÑOS — Rayado de pared en hall → MULTA ($50.000)
  2. [2025-10-22] OBRAS — Obras sin autorización en terraza → MULTA ($40.000)
  3. [2026-02-14] SEGURIDAD — Puerta de emergencia bloqueada → MULTA ($35.000)
```

**3 — `decision_agent`** recibe ambos informes y aplica su lógica:

- RES-001 normalmente sería *advertencia* en primera vez (`warnFirst`), **pero** el residente es reincidente → corresponde **MULTA**.
- Además el estado es `suspendido` → recargo **+50%** sobre el monto base: `$30.000 × 1,5 = $45.000`.
- Registra la resolución con `register_incident`, lo que agrega la incidencia al historial de la unidad 502.

### Respuesta final (`{ "result": ... }`)

```
RESOLUCIÓN: MULTA
Monto: $45.000 CLP (base $30.000 RES-001 + 50% por estado suspendido)
Residente: Jorge Castillo — Unidad 502 (SUSPENDIDO, reincidente)
Fundamento: Infracción RES-001 (ruido en horario de silencio, Art. 12).
  La política de advertencia en primera vez no aplica por reincidencia
  (3 incidencias previas con multa).
Acción: Multa cursada y registrada en el historial de la unidad.
```

### Observabilidad

Mientras esto ocurre, todo el flujo se puede observar en tiempo real:

- Cada `TASK`/`RESULT` entre orquestador y agentes se emite por Socket.io (`bus:event`) — útil para pintar el grafo de ejecución en un host.
- `documentation-agent` (broadcast listener) registra automáticamente cada evento en el audit trail bajo `./logs/`.

> Variantes para probar otros caminos de la lógica: unidad `101` (Roberto Sánchez, sin antecedentes) con una incidencia `warnFirst` → **ADVERTENCIA**; una conducta sin correspondencia en el reglamento → **DESESTIMADO**; unidad `305` (reincidente, activo) → **MULTA** sin recargo.

---

## Puntos de extensión

El diseño está hecho para reemplazar piezas sin tocar el resto. Las interfaces clave:

### Bus de mensajes — `IBus` (`src/bus/bus.interface.ts`)

```typescript
interface IBus {
  publish(msg: BusMessage): void
  subscribe(agentId: AgentId | 'broadcast', handler: (msg: BusMessage) => void): void
  unsubscribe(agentId: AgentId | 'broadcast'): void
}
```

Default: `InMemoryBus` (EventEmitter). Para escalar a múltiples procesos, implementa `RedisBus`/`RabbitMqBus` con la misma interfaz y pásalo al `AgentRegistry` y al `OrchestratorAgent` — los agentes no cambian.

Forma del mensaje (`BusMessage`): `{ id, from, to, type: TASK|RESULT|ERROR|LOG, payload, timestamp, correlationId? }`.

### Memoria — `IMemory` (`src/memory/memory.interface.ts`)

```typescript
interface IMemory {
  store(entry): Promise<MemoryEntry>
  retrieve(query, options?): Promise<MemoryEntry[]>
  forget(id): Promise<void>
  clear(): Promise<void>
  getAll(): Promise<MemoryEntry[]>
}
```

`CompositeMemory` orquesta cuatro estrategias: `ShortTermMemory` (ventana en memoria), `LongTermMemory` (JSON + embeddings), `GraphMemory` (entidades/relaciones, graphology) y `CustomMemory` (preferencias). Para usar un vector DB, implementa `IMemory` (ej. `PineconeMemory`) y reemplaza `longTerm` en `CompositeMemory`.

### Nuevo agente especialista

1. Crea el servidor MCP en `src/mcp-servers/nuevo.server.ts` con sus tools (`McpServer` de `@modelcontextprotocol/sdk`, transporte stdio).
2. Agrega una entrada a `AGENT_CONFIGS` en `src/agents/agent-config.ts` con `id`, `systemPrompt`, `mcpServers` y `orchestratorDescription` (esta última es lo que el orquestador "ve" para decidir cuándo delegarle).
3. Listo: `AgentRegistry` lo arranca y el orquestador lo incorpora dinámicamente a sus tools.

No hace falta editar el orquestador: construye sus herramientas en runtime a partir de los agentes activos del registry.

### Servidores MCP como servicios reales

Cada simulador es un proceso stdio independiente. Para conectar un servicio real, sustituye el comando/args del MCP en la config del agente por tu propio servidor MCP (o un proxy a tu API). El `filesystem.server.ts` está *sandboxed*: valida toda ruta contra `./sandbox/`.

---

## Referencia de la API HTTP

Base: `http://localhost:<PORT>`

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/task` | Ejecuta una tarea. Body `{ "task": string }` → `{ "result": string }`. `400` si falta `task`. |
| `GET` | `/agents` | Estado de todos los agentes (`id`, `label`, `running`, `enabled`, `description`). |
| `POST` | `/agents/:id/start` | Arranca un agente. |
| `POST` | `/agents/:id/stop` | Detiene un agente. |
| `POST` | `/agents/:id/toggle` | Alterna estado y notifica al frontend. |
| `GET` | `/memory` | Volcado de las cuatro memorias (sin embeddings). |
| `GET` | `/memory/graph-data` | Nodos y aristas del grafo de entidades. |
| `GET` | `/health` | `{ "status": "ok" }`. |

---

## Eventos Socket.io

El backend retransmite cada mensaje del bus por Socket.io, útil para visualizar el flujo en tiempo real desde un host externo:

```typescript
import { io } from 'socket.io-client'

const socket = io('http://localhost:3010')
socket.on('bus:event', (msg) => {
  // msg: BusMessage { from, to, type: TASK|RESULT|ERROR|LOG, payload, ... }
  console.log(msg.type, msg.from, '→', msg.to)
})
socket.on('agent:status', (status) => { /* cambios de estado de agentes */ })
```

---

## Notas técnicas

- **Instalación:** la raíz requiere `npm install --legacy-peer-deps` (zod v4 lo exige `@strands-agents/sdk` 1.4).
- **LLM:** Azure OpenAI vía `@ai-sdk/azure` + Vercel AI SDK v6. El orquestador usa `generateText` con `stopWhen: stepCountIs(15)`; los especialistas usan el `Agent` de Strands con `SlidingWindowConversationManager`.
- **MCP:** cada servidor corre como subproceso stdio (`tsx src/mcp-servers/*.server.ts`).
- **Sandbox:** `files-agent` no puede salir de `./sandbox/`; cualquier intento de escapar da error.
- **Persistencia:** memoria en `./data/` (`long-term.json`, `graph.json`, `preferences.json`); auditoría en `./logs/`; reportes generados en `./docs/`.
- **Timeout:** cada delegación a un agente expira a los 120 s.

Para una descripción más detallada de la arquitectura interna, ver [`plan.md`](./plan.md).
