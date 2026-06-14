export type AgentId =
  | 'orchestrator'
  | 'email-agent'
  | 'communication-agent'
  | 'files-agent'
  | 'documentation-agent'
  | 'inspection-agent'
  | 'resident-agent'
  | 'decision-agent'
  | 'broadcast'

export type MessageType = 'TASK' | 'RESULT' | 'ERROR' | 'LOG'

export interface BusMessage {
  id: string
  from: AgentId
  to: AgentId | 'broadcast'
  type: MessageType
  payload: unknown
  timestamp: string
  correlationId?: string
}

export type MemoryType = 'episodic' | 'semantic' | 'graph-node' | 'preference'

export interface MemoryEntry {
  id: string
  content: string
  metadata: Record<string, unknown>
  timestamp: string
  type: MemoryType
  embedding?: number[]
}

export interface RetrieveOptions {
  k?: number
  type?: MemoryType
  filter?: {
    agentId?: string
    since?: string
    [key: string]: unknown
  }
}
