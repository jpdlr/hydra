interface AgentSummary {
  agentId: string
  name: string
  status: 'running' | 'idle' | 'errored' | 'starting'
  model: string
  provider: string
  projectDir: string
}

interface AgentListProps {
  agents: AgentSummary[]
  onSelect: (agentId: string) => void
  onKill: (agentId: string) => void
  onRestart: (agentId: string) => void
}

export function AgentList({ agents, onSelect, onKill, onRestart }: AgentListProps) {
  if (agents.length === 0) {
    return (
      <div style={emptyStyle}>
        <p>No agents running</p>
        <p style={{ fontSize: '0.75rem', color: '#666' }}>
          Start an agent from your desktop to see it here
        </p>
      </div>
    )
  }

  return (
    <div style={listStyle}>
      {agents.map((agent) => (
        <div key={agent.agentId} style={cardStyle}>
          <div style={cardHeaderStyle}>
            <div style={statusDotStyle(agent.status)} />
            <button style={nameStyle} onClick={() => onSelect(agent.agentId)}>
              {agent.name}
            </button>
          </div>

          <div style={metaStyle}>
            <span>{agent.provider} / {agent.model}</span>
            <span>{getProjectName(agent.projectDir)}</span>
          </div>

          <div style={actionsStyle}>
            {agent.status === 'running' && (
              <button style={killBtnStyle} onClick={() => onKill(agent.agentId)}>
                Stop
              </button>
            )}
            {(agent.status === 'idle' || agent.status === 'errored') && (
              <button style={restartBtnStyle} onClick={() => onRestart(agent.agentId)}>
                Restart
              </button>
            )}
            <button style={chatBtnStyle} onClick={() => onSelect(agent.agentId)}>
              Chat
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function getProjectName(dir: string): string {
  const parts = dir.split('/')
  return parts[parts.length - 1] || dir
}

function statusDotStyle(status: string): React.CSSProperties {
  const colors: Record<string, string> = {
    running: '#4ade80',
    idle: '#a0a0a0',
    errored: '#f87171',
    starting: '#fbbf24'
  }
  return {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: colors[status] || '#666',
    flexShrink: 0
  }
}

const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '0 16px'
}

const cardStyle: React.CSSProperties = {
  background: '#232323',
  borderRadius: 12,
  padding: 16,
  border: '1px solid #333',
  display: 'flex',
  flexDirection: 'column',
  gap: 10
}

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8
}

const nameStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#e8e8e8',
  fontSize: '0.875rem',
  fontWeight: 600,
  cursor: 'pointer',
  padding: 0,
  textAlign: 'left'
}

const metaStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '0.6875rem',
  color: '#666'
}

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6
}

const killBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: '0.75rem',
  borderRadius: 6,
  border: '1px solid #f87171',
  color: '#f87171',
  background: 'transparent',
  cursor: 'pointer'
}

const restartBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: '0.75rem',
  borderRadius: 6,
  border: '1px solid #fbbf24',
  color: '#fbbf24',
  background: 'transparent',
  cursor: 'pointer'
}

const chatBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: '0.75rem',
  borderRadius: 6,
  border: '1px solid #e8e8e8',
  color: '#e8e8e8',
  background: 'transparent',
  cursor: 'pointer',
  marginLeft: 'auto'
}

const emptyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
  padding: 40,
  color: '#a0a0a0',
  fontSize: '0.875rem'
}
