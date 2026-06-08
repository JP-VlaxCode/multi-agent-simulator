import React, { useEffect, useState, useCallback } from 'react'
import { GraphCanvas } from './GraphCanvas.tsx'

interface MemoryEntry {
  id: string
  content: string
  metadata: Record<string, unknown>
  timestamp: string
  type: string
}

interface MemorySnapshot {
  shortTerm: MemoryEntry[]
  longTerm:  MemoryEntry[]
  graph:     MemoryEntry[]
  custom:    MemoryEntry[]
}

const PANELS = [
  {
    key: 'shortTerm' as const,
    label: 'Short-term',
    tag: 'episodic',
    color: 'var(--c-orchestrator)',
    desc: 'Últimas interacciones de la sesión actual (sliding window, in-memory)',
    emptyHint: 'Ejecuta una tarea para ver el historial de la sesión.',
  },
  {
    key: 'longTerm' as const,
    label: 'Long-term',
    tag: 'semantic',
    color: 'var(--c-email)',
    desc: 'Persistencia entre sesiones con búsqueda semántica por embeddings',
    emptyHint: 'Las interacciones se persisten aquí entre reinicios del servidor.',
  },
  {
    key: 'graph' as const,
    label: 'Graph',
    tag: 'graph-node',
    color: 'var(--c-comm)',
    desc: 'Entidades (personas, canales, archivos) y sus relaciones — graphology',
    emptyHint: 'Usa emails, teléfonos o nombres en tus tareas.\nEj: "envía a juan@empresa.com" o "lista /reportes"',
  },
  {
    key: 'custom' as const,
    label: 'Custom',
    tag: 'preference',
    color: 'var(--c-files)',
    desc: 'Preferencias y personalizaciones por agente (persistido en disco)',
    emptyHint: 'Se puebla al guardar preferencias explícitas del agente.',
  },
]

function fmt(ts: string) {
  try { return new Date(ts).toLocaleString('es', { dateStyle: 'short', timeStyle: 'medium' }) }
  catch { return ts }
}

export function MemoryView() {
  const [data, setData] = useState<MemorySnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/memory')
      if (res.ok) setData(await res.json() as MemorySnapshot)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const toggle = (id: string) =>
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  const total = data ? Object.values(data).flat().length : null

  return (
    <div className="memory-root">
      <div className="memory-toolbar">
        <span className="memory-toolbar-info">
          {loading
            ? 'Cargando...'
            : total === null
              ? 'Sin conexión con el servidor'
              : total === 0
                ? 'Ejecuta una tarea para poblar la memoria'
                : `${total} entradas totales`}
        </span>
        <button className="memory-refresh-btn" onClick={load} disabled={loading}>
          {loading ? '⟳ Cargando...' : '⟳ Refresh'}
        </button>
      </div>

      <div className="memory-panels">
        {PANELS.map(p => {
          const entries = data?.[p.key] ?? []
          return (
            <div key={p.key} className="memory-panel">
              <div className="memory-panel-header">
                <span className="memory-panel-dot" style={{ background: p.color }} />
                <span className="memory-panel-label">{p.label}</span>
                <span className="memory-panel-tag">{p.tag}</span>
                <span className="memory-panel-count">{entries.length}</span>
              </div>
              <div className="memory-panel-desc">{p.desc}</div>

              {p.key === 'graph' ? (
                <GraphCanvas />
              ) : (
              <div className="memory-entries">
                {entries.length === 0 ? (
                  <div className="memory-empty" style={{ whiteSpace: 'pre-line' }}>{p.emptyHint}</div>
                ) : (
                  entries.map(e => (
                    <div
                      key={e.id}
                      className={`memory-entry ${expanded[e.id] ? 'expanded' : ''}`}
                      onClick={() => toggle(e.id)}
                    >
                      <div className="memory-entry-top">
                        <span className="memory-entry-content">
                          {e.content.length > 80 ? e.content.slice(0, 80) + '…' : e.content}
                        </span>
                        <span className="memory-entry-time">{fmt(e.timestamp)}</span>
                      </div>
                      {expanded[e.id] && (
                        <div className="memory-entry-detail">
                          <div className="memory-entry-full">{e.content}</div>
                          {Object.keys(e.metadata).length > 0 && (
                            <pre className="memory-entry-meta">
                              {JSON.stringify(e.metadata, null, 2)}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
