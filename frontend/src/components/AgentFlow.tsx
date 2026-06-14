import React from 'react'
import type { BusEvent } from '../App.tsx'

interface Props { events: BusEvent[] }

const AGENT_COLORS: Record<string, string> = {
  orchestrator:          'var(--c-orchestrator)',
  'email-agent':         'var(--c-email)',
  'communication-agent': 'var(--c-comm)',
  'files-agent':         'var(--c-files)',
  'documentation-agent': 'var(--c-docs)',
  'inspection-agent':    '#F87171',
  'resident-agent':      '#FB923C',
  'decision-agent':      '#34D399',
  broadcast:             'var(--c-default)',
}

const AGENT_LABELS: Record<string, string> = {
  orchestrator:          'ORCH',
  'email-agent':         'EMAIL',
  'communication-agent': 'COMM',
  'files-agent':         'FILES',
  'documentation-agent': 'DOCS',
  'inspection-agent':    'INSP',
  'resident-agent':      'RESID',
  'decision-agent':      'DECIS',
  broadcast:             'ALL',
}

function fmt(ts: string) {
  try { return new Date(ts).toLocaleTimeString('es', { hour12: false }) }
  catch { return '--:--:--' }
}

export function AgentFlow({ events }: Props) {
  if (events.length === 0) {
    return (
      <div className="stream-empty">
        <div className="stream-empty-icon">⬡</div>
        <div className="stream-empty-text">
          Waiting for agent activity...<br />
          Submit a task to start the flow.
        </div>
      </div>
    )
  }

  return (
    <>
      {events.map(ev => {
        const payload = typeof ev.payload === 'string' ? ev.payload : JSON.stringify(ev.payload)
        const fromColor = AGENT_COLORS[ev.from] ?? 'var(--c-default)'
        const toColor   = AGENT_COLORS[ev.to]   ?? 'var(--c-default)'
        const fromLabel = AGENT_LABELS[ev.from]  ?? ev.from.toUpperCase()
        const toLabel   = AGENT_LABELS[ev.to]    ?? ev.to.toUpperCase()
        return (
          <div key={ev.id} className={`event-row type-${ev.type}`}>
            <span className="event-time">{fmt(ev.timestamp)}</span>
            <span className="event-badge" style={{ background: `color-mix(in srgb, ${fromColor} 18%, transparent)`, color: fromColor }}>
              {fromLabel}
            </span>
            <span className="event-arrow">→</span>
            <span className="event-badge" style={{ background: `color-mix(in srgb, ${toColor} 18%, transparent)`, color: toColor }}>
              {toLabel}
            </span>
            <span className="event-payload" title={payload}>
              {payload.slice(0, 140)}{payload.length > 140 ? '…' : ''}
            </span>
            <span className={`event-type-pill pill-${ev.type}`}>{ev.type}</span>
          </div>
        )
      })}
    </>
  )
}
