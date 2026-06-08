import React, { useState } from 'react'

interface Props {
  onSubmit: (task: string) => void
  loading: boolean
  collapsed: boolean
  onToggleCollapse: () => void
  hasResult?: boolean
}

const EXAMPLES = [
  'Lee mi bandeja de entrada',
  'Resume /reportes y envía email con el resumen',
  'Envía WhatsApp a +56912345678 con alertas de Teams',
  'Genera reporte de auditoría de esta sesión',
]

export function TaskInput({ onSubmit, loading, collapsed, onToggleCollapse, hasResult }: Props) {
  const [task, setTask] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!task.trim() || loading) return
    onSubmit(task.trim())
    setTask('')
  }

  if (collapsed) {
    return (
      <div className="command-area collapsed">
        <button className="command-label" onClick={onToggleCollapse}>
          Command
          {hasResult && (
            <span style={{ marginLeft: 8, width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', flexShrink: 0 }} />
          )}
          <span className="command-collapse-btn">↑ Expand</span>
        </button>
      </div>
    )
  }

  return (
    <div className="command-area">
      <div className="command-label">
        Command
        <button className="command-collapse-btn" onClick={onToggleCollapse} type="button">
          ↓ Minimize
        </button>
      </div>
      <div className="command-body">
        <form className="command-form" onSubmit={handleSubmit}>
          <div className="command-input-wrapper">
            <span className="command-prefix">▸</span>
            <input
              className="command-input"
              type="text"
              value={task}
              onChange={e => setTask(e.target.value)}
              placeholder="Describe la tarea para los agentes..."
              disabled={loading}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !task.trim()}
            className={`run-btn ${loading ? 'loading' : ''}`}
          >
            {loading
              ? <><span className="run-spinner" /> RUNNING</>
              : <>RUN ▶</>
            }
          </button>
        </form>
        <div className="examples-row">
          <span className="examples-label">Try:</span>
          {EXAMPLES.map(ex => (
            <button
              key={ex}
              className="example-chip"
              onClick={() => setTask(ex)}
              disabled={loading}
              type="button"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
