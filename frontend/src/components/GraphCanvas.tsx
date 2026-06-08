import React, { useEffect, useRef, useState, useCallback } from 'react'

interface GNode { id: string; label: string; type: string }
interface GEdge { source: string; target: string; relation: string }
interface GraphData { nodes: GNode[]; edges: GEdge[] }

interface SimNode extends GNode {
  x: number; y: number; vx: number; vy: number
}

const NODE_COLORS: Record<string, string> = {
  agent:    '#9580FF',
  service:  '#22D3EE',
  channel:  '#22D3A0',
  file:     '#FF9D4D',
  email:    '#5BA3FF',
  phone:    '#10B981',
  person:   '#FF6BB5',
  topic:    '#F59E0B',
  unknown:  '#64748B',
}

function nodeColor(type: string) {
  return NODE_COLORS[type] ?? NODE_COLORS.unknown
}

function runSimulation(nodes: SimNode[], edges: GEdge[], width: number, height: number): SimNode[] {
  const cx = width / 2, cy = height / 2
  const k_repel = 4000, k_attract = 0.04, k_gravity = 0.015, dt = 0.6
  const ITERS = 120

  for (let iter = 0; iter < ITERS; iter++) {
    const forces = nodes.map(() => ({ x: 0, y: 0 }))

    // repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x
        const dy = nodes[i].y - nodes[j].y
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01
        const f = k_repel / (dist * dist)
        forces[i].x += f * dx / dist
        forces[i].y += f * dy / dist
        forces[j].x -= f * dx / dist
        forces[j].y -= f * dy / dist
      }
    }

    // attraction along edges
    for (const edge of edges) {
      const si = nodes.findIndex(n => n.id === edge.source)
      const ti = nodes.findIndex(n => n.id === edge.target)
      if (si < 0 || ti < 0) continue
      const dx = nodes[ti].x - nodes[si].x
      const dy = nodes[ti].y - nodes[si].y
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01
      const idealDist = 120
      const f = k_attract * (dist - idealDist)
      forces[si].x += f * dx / dist
      forces[si].y += f * dy / dist
      forces[ti].x -= f * dx / dist
      forces[ti].y -= f * dy / dist
    }

    // gravity to center
    for (let i = 0; i < nodes.length; i++) {
      forces[i].x -= k_gravity * (nodes[i].x - cx)
      forces[i].y -= k_gravity * (nodes[i].y - cy)
    }

    // integrate
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].vx = (nodes[i].vx + forces[i].x * dt) * 0.85
      nodes[i].vy = (nodes[i].vy + forces[i].y * dt) * 0.85
      nodes[i].x = Math.max(40, Math.min(width - 40, nodes[i].x + nodes[i].vx))
      nodes[i].y = Math.max(40, Math.min(height - 40, nodes[i].y + nodes[i].vy))
    }
  }
  return nodes
}

export function GraphCanvas() {
  const [data, setData] = useState<GraphData | null>(null)
  const [simNodes, setSimNodes] = useState<SimNode[]>([])
  const [loading, setLoading] = useState(false)
  const [hovered, setHovered] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 600, h: 400 })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/memory/graph-data')
      if (res.ok) setData(await res.json() as GraphData)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth || 600, h: el.clientHeight || 400 })
    })
    ro.observe(el)
    setSize({ w: el.clientWidth || 600, h: el.clientHeight || 400 })
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!data || data.nodes.length === 0) { setSimNodes([]); return }
    const { w, h } = size
    const cx = w / 2, cy = h / 2
    const angle = (2 * Math.PI) / data.nodes.length
    const radius = Math.min(w, h) * 0.3
    const initial: SimNode[] = data.nodes.map((n, i) => ({
      ...n,
      x: cx + Math.cos(angle * i) * radius + (Math.random() - 0.5) * 20,
      y: cy + Math.sin(angle * i) * radius + (Math.random() - 0.5) * 20,
      vx: 0, vy: 0,
    }))
    setSimNodes(runSimulation(initial, data.edges, w, h))
  }, [data, size])

  const getNode = (id: string) => simNodes.find(n => n.id === id)

  if (loading) {
    return <div style={styles.placeholder}>Cargando grafo...</div>
  }
  if (!data || data.nodes.length === 0) {
    return (
      <div style={styles.placeholder}>
        <div style={{ fontSize: 28, opacity: 0.3, marginBottom: 8 }}>⬡</div>
        <div>El grafo se puebla con entidades extraídas de cada tarea.</div>
        <div style={{ marginTop: 4, opacity: 0.6 }}>Prueba: "lee el canal #general de Teams"</div>
      </div>
    )
  }

  return (
    <div ref={containerRef} style={styles.root}>
      <div style={styles.toolbar}>
        <span style={styles.legend}>
          {Object.entries(NODE_COLORS).filter(([k]) => k !== 'unknown').map(([type, color]) => (
            <span key={type} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={styles.legendLabel}>{type}</span>
            </span>
          ))}
        </span>
        <button style={styles.refreshBtn} onClick={load}>⟳</button>
      </div>

      <svg width={size.w} height={size.h - 36} style={{ display: 'block' }}>
        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#4D6080" />
          </marker>
        </defs>

        {/* Edges */}
        {data.edges.map((edge, i) => {
          const s = getNode(edge.source)
          const t = getNode(edge.target)
          if (!s || !t) return null
          const mx = (s.x + t.x) / 2
          const my = (s.y + t.y) / 2
          const isHovered = hovered === s.id || hovered === t.id
          return (
            <g key={i}>
              <line
                x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                stroke={isHovered ? '#8AA4CC' : '#2D3D58'}
                strokeWidth={isHovered ? 1.5 : 1}
                markerEnd="url(#arrow)"
                strokeOpacity={isHovered ? 1 : 0.6}
              />
              {isHovered && edge.relation && (
                <text
                  x={mx} y={my - 4}
                  fill="#8AA4CC" fontSize={9}
                  textAnchor="middle" fontFamily="JetBrains Mono, monospace"
                >
                  {edge.relation}
                </text>
              )}
            </g>
          )
        })}

        {/* Nodes */}
        {simNodes.map(node => {
          const color = nodeColor(node.type)
          const isHov = hovered === node.id
          const r = isHov ? 10 : 8
          return (
            <g
              key={node.id}
              transform={`translate(${node.x},${node.y})`}
              onMouseEnter={() => setHovered(node.id)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'default' }}
            >
              {isHov && (
                <circle r={16} fill={color} opacity={0.15} />
              )}
              <circle
                r={r} fill={color} opacity={0.9}
                stroke={isHov ? '#fff' : 'rgba(255,255,255,0.2)'}
                strokeWidth={isHov ? 1.5 : 1}
              />
              <text
                y={r + 12} textAnchor="middle"
                fill={isHov ? '#E2EAFA' : '#8AA4CC'}
                fontSize={isHov ? 10 : 9}
                fontFamily="JetBrains Mono, monospace"
                fontWeight={isHov ? 600 : 400}
              >
                {node.label.length > 18 ? node.label.slice(0, 16) + '…' : node.label}
              </text>
              {isHov && node.type !== 'unknown' && (
                <text
                  y={r + 23} textAnchor="middle"
                  fill={color} fontSize={8}
                  fontFamily="JetBrains Mono, monospace"
                  opacity={0.8}
                >
                  {node.type}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' },
  placeholder: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    color: '#4D6080', fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
    textAlign: 'center', lineHeight: 1.6, padding: 24,
  },
  toolbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '6px 12px', borderBottom: '1px solid rgba(148,168,210,0.14)',
    flexShrink: 0, height: 36,
  },
  legend: { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  legendLabel: { fontSize: 9, color: '#4D6080', fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.06em' },
  refreshBtn: {
    background: 'none', border: '1px solid rgba(148,168,210,0.14)', borderRadius: 4,
    color: '#4D6080', cursor: 'pointer', fontSize: 12, padding: '2px 8px',
    fontFamily: 'JetBrains Mono, monospace',
  },
}
