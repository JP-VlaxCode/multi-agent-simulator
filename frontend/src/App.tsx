import React, { useState, useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { TaskInput } from './components/TaskInput.tsx'
import { AgentFlow } from './components/AgentFlow.tsx'
import { ResultPanel } from './components/ResultPanel.tsx'
import { MemoryView } from './components/MemoryView.tsx'

export interface BusEvent {
  id: string
  from: string
  to: string
  type: 'TASK' | 'RESULT' | 'ERROR' | 'LOG'
  payload: unknown
  timestamp: string
  correlationId?: string
}

interface AgentDef {
  id: string
  label: string
  role: string
  color: string
  description: string
  mcpServers: { name: string; label: string }[]
  tools: string[]
}

const AGENTS: AgentDef[] = [
  {
    id: 'orchestrator',
    label: 'Orchestrator',
    role: 'router',
    color: 'var(--c-orchestrator)',
    description: 'Recibe tareas del usuario, las descompone y delega sub-tareas a los agentes especialistas. Sintetiza los resultados en una respuesta final.',
    mcpServers: [],
    tools: ['email_agent', 'communication_agent', 'files_agent', 'documentation_agent'],
  },
  {
    id: 'email-agent',
    label: 'Email',
    role: 'email',
    color: 'var(--c-email)',
    description: 'Gestiona operaciones de correo electrónico usando un servidor de email simulado con inbox pre-poblado.',
    mcpServers: [{ name: 'email.server.ts', label: 'email-simulator' }],
    tools: ['read_inbox', 'get_email', 'search_emails', 'send_email'],
  },
  {
    id: 'communication-agent',
    label: 'Comm',
    role: 'messaging',
    color: 'var(--c-comm)',
    description: 'Gestiona mensajería en Microsoft Teams y WhatsApp, con canales y contactos simulados.',
    mcpServers: [
      { name: 'teams.server.ts', label: 'teams-simulator' },
      { name: 'whatsapp.server.ts', label: 'whatsapp-simulator' },
    ],
    tools: ['list_channels', 'read_channel', 'teams_send_message', 'get_contacts', 'read_chat', 'whatsapp_send_message'],
  },
  {
    id: 'files-agent',
    label: 'Files',
    role: 'filesystem',
    color: 'var(--c-files)',
    description: 'Operaciones de archivos dentro del directorio sandbox permitido. Acceso restringido a ./sandbox/.',
    mcpServers: [{ name: 'filesystem.server.ts', label: 'filesystem-simulator' }],
    tools: ['list_directory', 'read_file', 'write_file', 'delete_file', 'create_directory'],
  },
  {
    id: 'documentation-agent',
    label: 'Docs',
    role: 'audit',
    color: 'var(--c-docs)',
    description: 'Registra todos los eventos del sistema, responde consultas de documentación y genera reportes de auditoría.',
    mcpServers: [{ name: 'documentation.server.ts', label: 'documentation-simulator' }],
    tools: ['log_event', 'get_audit_trail', 'save_doc', 'query_docs', 'generate_report'],
  },
  {
    id: 'inspection-agent',
    label: 'Inspection',
    role: 'infractions',
    color: '#F87171',
    description: 'Revisa el reglamento de copropiedad y determina si una incidencia constituye infracción formal, indicando código, monto y base legal.',
    mcpServers: [{ name: 'regulations.server.ts', label: 'regulations-simulator' }],
    tools: ['list_violation_types', 'check_violation', 'get_fine_amount'],
  },
  {
    id: 'resident-agent',
    label: 'Resident',
    role: 'history',
    color: '#FB923C',
    description: 'Consulta el historial de incidencias de residentes y determina si son reincidentes. Accede a la base de datos de vecinos.',
    mcpServers: [{ name: 'residents.server.ts', label: 'residents-simulator' }],
    tools: ['get_resident_history', 'find_resident_by_name', 'list_residents', 'register_incident'],
  },
  {
    id: 'decision-agent',
    label: 'Decision',
    role: 'resolution',
    color: '#34D399',
    description: 'Emite la resolución final sobre una incidencia: Multa, Advertencia Formal o Desestimado. Registra la decisión en el sistema.',
    mcpServers: [{ name: 'residents.server.ts', label: 'residents-simulator' }],
    tools: ['register_incident', 'get_resident_history'],
  },
]

interface AgentStatus { id: string; label: string; running: boolean; enabled: boolean; description: string }

export default function App() {
  const [events, setEvents] = useState<BusEvent[]>([])
  const [result, setResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeAgents, setActiveAgents] = useState<Set<string>>(new Set())
  const [selectedAgent, setSelectedAgent] = useState<AgentDef | null>(null)
  const [activeTab, setActiveTab] = useState<'events' | 'memory'>('events')
  const [memoryKey, setMemoryKey] = useState(0)
  const [commandCollapsed, setCommandCollapsed] = useState(false)
  const [agentStatuses, setAgentStatuses] = useState<AgentStatus[]>([])
  const [toggling, setToggling] = useState<string | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const streamRef = useRef<HTMLDivElement>(null)

  const fetchStatuses = async () => {
    try {
      const res = await fetch('/agents')
      if (res.ok) setAgentStatuses(await res.json() as AgentStatus[])
    } catch { /* ignore */ }
  }

  const toggleAgent = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setToggling(id)
    try {
      await fetch(`/agents/${id}/toggle`, { method: 'POST' })
      await fetchStatuses()
    } finally { setToggling(null) }
  }

  useEffect(() => {
    void fetchStatuses()
    const socket = io('http://localhost:3010')
    socketRef.current = socket
    socket.on('connect', () => {})
    socket.on('disconnect', () => {})
    socket.on('bus:event', (msg: BusEvent) => {
      setEvents(prev => [...prev, msg])
      setActiveAgents(prev => new Set([...prev, msg.from]))
      setTimeout(() => {
        setActiveAgents(prev => { const s = new Set(prev); s.delete(msg.from); return s })
      }, 800)
    })
    socket.on('agent:status', (statuses: AgentStatus[]) => setAgentStatuses(statuses))
    return () => { socket.disconnect() }
  }, [])

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight
    }
  }, [events])

  const handleSubmit = async (task: string) => {
    setLoading(true)
    setResult(null)
    setError(null)
    setEvents([])
    try {
      const res = await fetch('/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      })
      const data = await res.json() as { result?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Error desconocido')
      setResult(data.result ?? '')
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
      setMemoryKey(k => k + 1) // trigger MemoryView refresh
    }
  }

  const selectAgent = (a: AgentDef) =>
    setSelectedAgent(prev => prev?.id === a.id ? null : a)

  return (
    <div className="nexus-root">
      {/* Header */}
      <header className="header">
        <div className="header-logo">
          <div className="header-logo-mark">NX</div>
          <span className="header-title">NEXUS</span>
        </div>
        <span className="header-sep">·</span>
        <span className="header-sub">Multi-Agent Simulator</span>
        <div className="header-right">
          {events.length > 0 && (
            <button className="clear-btn" onClick={() => { setEvents([]); setResult(null); setError(null) }}>
              CLEAR
            </button>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="main-body">

        {/* Agent roster */}
        <aside className="agent-panel">
          <div className="panel-label">Agents</div>
          {AGENTS.map(a => {
            const status = agentStatuses.find(s => s.id === a.id)
            const isRunning = status?.running ?? true
            const isToggling = toggling === a.id
            return (
              <div
                key={a.id}
                className={`agent-item ${activeAgents.has(a.id) ? 'active' : ''} ${selectedAgent?.id === a.id ? 'selected' : ''} ${!isRunning ? 'stopped' : ''}`}
                onClick={() => selectAgent(a)}
              >
                <span
                  className={`agent-node ${activeAgents.has(a.id) ? 'pulsing' : ''}`}
                  style={{ background: isRunning ? a.color : 'var(--text-muted)', color: a.color }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="agent-name">{a.label}</div>
                  <div className="agent-role">{a.role}</div>
                </div>
                <button
                  className={`agent-toggle-btn ${isRunning ? 'running' : 'stopped'}`}
                  onClick={(e) => toggleAgent(a.id, e)}
                  disabled={isToggling}
                  title={isRunning ? 'Detener agente' : 'Iniciar agente'}
                >
                  {isToggling ? '…' : isRunning ? '■' : '▶'}
                </button>
              </div>
            )
          })}
        </aside>

        {/* Agent detail panel */}
        {selectedAgent && (
          <div className="detail-panel" key={selectedAgent.id}>
            <div className="detail-header">
              <span className="detail-dot" style={{ background: selectedAgent.color }} />
              <span className="detail-title">{selectedAgent.label} Agent</span>
              <button className="detail-close" onClick={() => setSelectedAgent(null)}>✕</button>
            </div>

            <div className="detail-body">
              <p className="detail-desc">{selectedAgent.description}</p>

              <div className="detail-section">
                <div className="detail-section-label">MCP Servers</div>
                {selectedAgent.mcpServers.length === 0 ? (
                  <div className="detail-empty">No MCP — delegates via bus</div>
                ) : (
                  selectedAgent.mcpServers.map(s => (
                    <div key={s.name} className="mcp-item">
                      <span className="mcp-icon">⬡</span>
                      <div>
                        <div className="mcp-label">{s.label}</div>
                        <div className="mcp-file">{s.name}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="detail-section">
                <div className="detail-section-label">Tools</div>
                <div className="tool-grid">
                  {selectedAgent.tools.map(t => (
                    <span key={t} className="tool-chip">{t}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Event stream + Memory tabs */}
        <div className="stream-pane">
          <div className="stream-header">
            <div className="stream-tabs">
              <button
                className={`stream-tab ${activeTab === 'events' ? 'active' : ''}`}
                onClick={() => setActiveTab('events')}
              >
                Event Bus {events.length > 0 && `· ${events.length}`}
              </button>
              <button
                className={`stream-tab ${activeTab === 'memory' ? 'active' : ''}`}
                onClick={() => setActiveTab('memory')}
              >
                Memory
              </button>
            </div>
          </div>

          {activeTab === 'events' ? (
            <div className="stream-body" ref={streamRef}>
              <AgentFlow events={events} />
            </div>
          ) : (
            <MemoryView key={memoryKey} />
          )}
        </div>

      </div>

      {/* Result — hide when command collapsed */}
      {!commandCollapsed && (
        <ResultPanel result={result} loading={loading} error={error} />
      )}

      {/* Command */}
      <TaskInput
        onSubmit={handleSubmit}
        loading={loading}
        collapsed={commandCollapsed}
        onToggleCollapse={() => setCommandCollapsed(c => !c)}
        hasResult={!!result || !!error}
      />
    </div>
  )
}
