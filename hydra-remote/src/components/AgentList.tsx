import { useEffect, useMemo, useState, type CSSProperties } from 'react'

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
  const [projectSearch, setProjectSearch] = useState('')
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({})

  const groupedProjects = useMemo(() => {
    const groups = new Map<string, AgentSummary[]>()

    for (const agent of agents) {
      const project = getProjectName(agent.projectDir)
      const list = groups.get(project) ?? []
      list.push(agent)
      groups.set(project, list)
    }

    return Array.from(groups.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([project, projectAgents]) => [
        project,
        [...projectAgents].sort((left, right) => left.name.localeCompare(right.name))
      ] as const)
  }, [agents])

  useEffect(() => {
    setExpandedProjects((current) => {
      let changed = false
      const next = { ...current }

      for (const [project] of groupedProjects) {
        if (next[project] === undefined) {
          next[project] = true
          changed = true
        }
      }

      return changed ? next : current
    })
  }, [groupedProjects])

  const normalizedSearch = projectSearch.trim().toLowerCase()
  const visibleProjects = useMemo(() => {
    if (!normalizedSearch) return groupedProjects
    return groupedProjects.filter(([project]) => project.toLowerCase().includes(normalizedSearch))
  }, [groupedProjects, normalizedSearch])

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
      <div style={searchWrapStyle}>
        <input
          style={searchInputStyle}
          type="search"
          value={projectSearch}
          onChange={(event) => setProjectSearch(event.target.value)}
          placeholder="Search projects..."
          aria-label="Search projects"
        />
      </div>

      {visibleProjects.length === 0 && (
        <div style={emptySearchStyle}>
          <p>No matching projects</p>
          <p style={{ fontSize: '0.75rem', color: '#666' }}>
            Try a different project folder name.
          </p>
        </div>
      )}

      {visibleProjects.map(([project, projectAgents]) => {
        const expanded = expandedProjects[project] ?? true

        return (
          <section key={project} style={projectSectionStyle}>
            <button
              style={projectHeaderStyle}
              onClick={() =>
                setExpandedProjects((current) => ({
                  ...current,
                  [project]: !expanded
                }))
              }
            >
              <span style={projectChevronStyle}>{expanded ? '▾' : '▸'}</span>
              <span style={projectTitleStyle}>{project}</span>
              <span style={projectCountStyle}>{projectAgents.length}</span>
            </button>

            {expanded && (
              <div style={projectBodyStyle}>
                {projectAgents.map((agent) => (
                  <div key={agent.agentId} style={cardStyle}>
                    <div style={cardHeaderStyle}>
                      <div style={statusDotStyle(agent.status)} />
                      <button style={nameStyle} onClick={() => onSelect(agent.agentId)}>
                        {agent.name}
                      </button>
                    </div>

                    <div style={metaStyle}>
                      <span>{agent.provider} / {agent.model}</span>
                      <span>{project}</span>
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
            )}
          </section>
        )
      })}
    </div>
  )
}

function getProjectName(dir: string): string {
  const normalized = dir.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || normalized || 'Unknown Project'
}

function statusDotStyle(status: string): CSSProperties {
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

const listStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '0 16px'
}

const searchWrapStyle: CSSProperties = {
  position: 'sticky',
  top: 72,
  zIndex: 1,
  background: '#191919',
  paddingBottom: 8
}

const searchInputStyle: CSSProperties = {
  width: '100%',
  border: '1px solid #2f3f4f',
  borderRadius: 10,
  background: 'linear-gradient(180deg, #1f2730 0%, #1a222b 100%)',
  color: '#d6e5f0',
  padding: '10px 12px',
  fontSize: '0.875rem',
  outline: 'none'
}

const projectSectionStyle: CSSProperties = {
  border: '1px solid #2d2d2d',
  borderRadius: 12,
  background: '#1d1f22',
  overflow: 'hidden'
}

const projectHeaderStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: 'linear-gradient(90deg, #1f242b 0%, #1a2430 100%)',
  border: 'none',
  color: '#d7e7f4',
  padding: '10px 12px',
  cursor: 'pointer'
}

const projectChevronStyle: CSSProperties = {
  fontSize: '0.75rem',
  opacity: 0.9
}

const projectTitleStyle: CSSProperties = {
  fontSize: '0.8125rem',
  fontWeight: 700,
  letterSpacing: 0.2,
  textAlign: 'left'
}

const projectCountStyle: CSSProperties = {
  marginLeft: 'auto',
  padding: '2px 8px',
  borderRadius: 999,
  border: '1px solid #3d4b59',
  fontSize: '0.6875rem',
  color: '#a9bac9'
}

const projectBodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 10
}

const cardStyle: CSSProperties = {
  background: '#232323',
  borderRadius: 12,
  padding: 16,
  border: '1px solid #333',
  display: 'flex',
  flexDirection: 'column',
  gap: 10
}

const cardHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8
}

const nameStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#e8e8e8',
  fontSize: '0.875rem',
  fontWeight: 600,
  cursor: 'pointer',
  padding: 0,
  textAlign: 'left'
}

const metaStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '0.6875rem',
  color: '#666'
}

const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: 6
}

const killBtnStyle: CSSProperties = {
  padding: '6px 12px',
  fontSize: '0.75rem',
  borderRadius: 6,
  border: '1px solid #f87171',
  color: '#f87171',
  background: 'transparent',
  cursor: 'pointer'
}

const restartBtnStyle: CSSProperties = {
  padding: '6px 12px',
  fontSize: '0.75rem',
  borderRadius: 6,
  border: '1px solid #fbbf24',
  color: '#fbbf24',
  background: 'transparent',
  cursor: 'pointer'
}

const chatBtnStyle: CSSProperties = {
  padding: '6px 12px',
  fontSize: '0.75rem',
  borderRadius: 6,
  border: '1px solid #e8e8e8',
  color: '#e8e8e8',
  background: 'transparent',
  cursor: 'pointer',
  marginLeft: 'auto'
}

const emptyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
  padding: 40,
  color: '#a0a0a0',
  fontSize: '0.875rem'
}

const emptySearchStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
  padding: 24,
  border: '1px solid #333',
  borderRadius: 12,
  background: '#1f1f1f',
  color: '#a0a0a0',
  fontSize: '0.875rem'
}
