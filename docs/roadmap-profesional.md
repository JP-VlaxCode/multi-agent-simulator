# Roadmap: De POC a Servicio Profesional

## Estado actual

Sistema multi-agente en producción local con: orquestador, 7 agentes especialistas, Redis bus, Qdrant vector store, memoria compuesta de 4 capas con hybrid search, frontend React, CLI interactivo. Docker Compose para infraestructura (Redis + Qdrant), app corre en terminal.

---

## Fase 1 — Fundamentos de producción ✅ COMPLETADA

### 1.1 Configuración y entorno
- [x] Validación de env vars con zod (`src/config/env.ts`)
- [x] Manejo por entorno (dev/staging/prod) via `NODE_ENV`
- [x] Docker Compose para infraestructura (Redis + Qdrant)
- [x] Dockerfile para deploy

### 1.2 Logging y observabilidad
- [x] Logger pino (JSON prod, pretty dev)
- [x] Correlation ID propagado
- [x] Health check detallado
- [x] Métricas: latencia, tokens, errores por agente + `/metrics` endpoint
- [ ] OpenTelemetry tracing (post-MVP)

### 1.3 Error handling
- [x] Error boundary Express
- [x] Retry exponential backoff
- [x] Circuit breaker (5 fallos → open 60s)
- [x] Dead letter queue + `/dlq` API
- [x] Graceful shutdown

### 1.4 Bus robusto
- [x] RedisBus (Pub/Sub + Streams)
- [x] Bus factory con auto-fallback
- [x] Backpressure por agente (maxQueueSize)
- [x] Timeout configurable por agente

---

## Fase 2 — Memoria profesional ✅ COMPLETADA

Objetivo: memoria escalable, con retrieval de calidad y trazabilidad.

### 2.1 Vector store real
- [x] Qdrant vector DB en Docker — `src/memory/qdrant.memory.ts`
- [x] Chunking inteligente: divide en fragmentos de ~500 chars por límites de oración
- [x] Metadata filtering: búsqueda por agentId, type, timestamp range
- [x] Memory factory: auto-selección Qdrant vs JSON según `QDRANT_URL`

### 2.2 Knowledge graph
- [x] Entity resolution: normaliza prefijos (vecino del, residente de) + fuzzy match con nodos existentes
- [x] Decay temporal: edges recientes puntúan más alto (half-life 30 días)
- [ ] Migrar de JSON a Neo4j (post-MVP, el graph actual funciona para el volumen esperado)
- [ ] Queries multi-hop Cypher (requiere Neo4j)

### 2.3 Retrieval mejorado
- [x] Hybrid search: vector similarity + keyword fallback cuando embeddings no están disponibles
- [x] Context window management: máximo 2000 chars inyectados (~500 tokens), trunca sin sobrecargar
- [ ] Reranking con modelo ligero (post-MVP)
- [ ] Feedback loop (requiere métricas de uso de contexto)

### 2.4 Gestión de datos
- [x] TTL y compaction: método `compact(maxAgeDays)` elimina entries antiguas de Qdrant
- [ ] Versionado de embeddings (tag con modelo+versión para invalidar si cambia)
- [ ] Export/import de memoria para backup y migración

---

## Fase 3 — Agentes robustos (2-3 semanas)

Objetivo: agentes más autónomos, seguros y testeables.

### 3.1 Lifecycle y escalabilidad
- [ ] Cada agente como proceso/worker independiente (no todo en un solo event loop)
- [ ] Agent pool: múltiples instancias del mismo agente para concurrencia
- [ ] Hot reload: agregar/quitar agentes sin reiniciar el sistema
- [ ] Resource limits por agente (max tokens/min, max concurrent tasks)

### 3.2 Seguridad y governance
- [ ] Capa de permisos: qué agente puede invocar qué tools
- [ ] Approval workflow: tareas sensibles (enviar email, borrar archivo) requieren confirmación humana
- [ ] Input sanitization: validar payloads antes de pasar al LLM
- [ ] Output guardrails: verificar que respuestas no contengan PII expuesto
- [ ] Audit trail inmutable (append-only log con firma)

### 3.3 Testing
- [ ] Unit tests para cada memory strategy (jest/vitest)
- [ ] Integration tests: task completa end-to-end con LLM mockeado
- [ ] Contract tests para MCP servers (verificar que tools devuelven el schema esperado)
- [ ] Load testing: N tareas concurrentes, medir degradación
- [ ] Chaos testing: matar un agente mid-task, verificar recovery

### 3.4 Prompt engineering
- [ ] Prompt templates externalizados (no hardcoded en agent-config)
- [ ] Prompt versioning y A/B testing
- [ ] System prompt que incluya dinámicamente las capabilities disponibles
- [ ] Few-shot examples por dominio de tarea

---

## Fase 4 — Frontend profesional (2 semanas)

Objetivo: dashboard operacional, no solo demo.

### 4.1 UI/UX
- [ ] Dashboard con estado en tiempo real de todos los agentes (health, load, last activity)
- [ ] Visualización del grafo de conocimiento interactiva (drag, zoom, filter por tipo)
- [ ] Timeline de eventos del bus (filtrable por agente, tipo, tiempo)
- [ ] Panel de memoria: buscar, inspeccionar y borrar entries
- [ ] Task history con replay (re-ejecutar una tarea pasada)

### 4.2 Admin
- [ ] Toggle agentes on/off desde UI (ya existe parcialmente)
- [ ] Configuración de prompts desde UI
- [ ] Approval queue: tareas pendientes de confirmación humana
- [ ] Cost dashboard: tokens consumidos por agente/día

### 4.3 UX de chat
- [ ] Streaming de respuestas (SSE o WebSocket chunks)
- [ ] Mostrar plan del orquestador antes de ejecutar ("Voy a usar files-agent y email-agent")
- [ ] Cancelar tarea en progreso
- [ ] Multi-turn: conversación con contexto (no solo single-shot)

---

## Fase 5 — Infraestructura y deploy (1-2 semanas)

### 5.1 CI/CD
- [ ] GitHub Actions: lint + type check + tests en cada PR
- [ ] Build y push Docker image a registry
- [ ] Deploy automático a staging en merge a main
- [ ] Promote manual a production

### 5.2 Cloud
- [ ] Kubernetes / ECS para el backend (escalado horizontal)
- [ ] Redis managed (ElastiCache o Upstash)
- [ ] Vector DB managed (Qdrant Cloud o pgvector en RDS)
- [ ] Secrets en AWS Secrets Manager / Azure Key Vault (no .env en producción)
- [ ] CDN para frontend (CloudFront, Vercel, o Cloudflare Pages)

### 5.3 Monitoreo en producción
- [ ] Alertas: agent down, latencia > threshold, error rate spike
- [ ] Dashboard Grafana/Datadog con métricas del sistema
- [ ] Log aggregation (CloudWatch, Loki, o Datadog Logs)
- [ ] Cost monitoring de Azure OpenAI (presupuesto + alertas)

---

## Fase 6 — Features avanzadas (ongoing)

### 6.1 Multi-tenancy
- [ ] Aislamiento de datos por tenant (memoria, sandbox, configs)
- [ ] Rate limiting por tenant
- [ ] Billing por uso (tokens, tareas ejecutadas)

### 6.2 Agent intelligence
- [ ] Planning explícito: el orquestador genera un plan, lo ejecuta paso a paso
- [ ] Self-reflection: el agente evalúa su propia respuesta antes de devolver
- [ ] Learning from feedback: el usuario califica resultados, se ajustan prompts/pesos
- [ ] Tool discovery: agentes que pueden explorar y aprender nuevas tools

### 6.3 Integraciones reales
- [ ] Reemplazar MCP simulados por APIs reales (Gmail, MS Graph, Slack, etc.)
- [ ] Webhook inbound: triggers externos que lanzan tareas automáticas
- [ ] Scheduled tasks: cron-based (reportes diarios, monitoreo periódico)

### 6.4 Resiliencia avanzada
- [ ] Event sourcing: reconstruir estado completo desde eventos
- [ ] Saga pattern para workflows multi-agente con compensación
- [ ] Idempotency keys para evitar duplicados en retry

---

## Prioridad sugerida

```
Fase 1 (fundamentos)     ████████████████████  ✅ COMPLETADA
Fase 2 (memoria)         ████████████████████  ✅ COMPLETADA
Fase 3 (agentes)         ████████████░░░░░░░░  ← Siguiente
Fase 4 (frontend)        ░░░░░░░░░░░░████████  ← Puede ir en paralelo con 3
Fase 5 (infra)           ░░░░░░░░░░░░░░░░████
Fase 6 (avanzado)        ░░░░░░░░░░░░░░░░░░░░  ← Iterativo post-launch
```

---

## Decisiones técnicas clave

| Decisión | Recomendación | Razón |
|----------|---------------|-------|
| Bus | Redis Streams | Persistencia, replay, consumer groups para escalado |
| Vector DB | Qdrant (self-hosted o cloud) | Buen balance costo/features, filtrado por metadata |
| Graph DB | Neo4j Aura o memgraph | Cypher queries, visualización nativa |
| Process model | Workers separados por agente | Aislamiento de fallas, escalado independiente |
| Auth | API keys + JWT para frontend | Simple para MVP, extensible a OAuth |
| Observability | OpenTelemetry + Grafana stack | Vendor-neutral, completo |
| LLM fallback | Azure → OpenAI directo → local (Ollama) | Resiliencia ante caídas |

---

## Métricas de éxito

- **Disponibilidad**: 99.5%+ uptime del orquestador
- **Latencia p95**: < 15s para tareas single-agent, < 30s para multi-agent
- **Reliability**: < 2% de tareas fallidas por errores de sistema (no por LLM)
- **Cost efficiency**: < $0.05 USD por tarea promedio
- **Memory precision**: Contexto inyectado es relevante en > 80% de los casos
