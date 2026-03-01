import { useEffect, useMemo, useState, type CSSProperties } from 'react'

type DateFilterKey = '24h' | '7d' | '30d' | 'all'

const DATE_FILTERS: Array<{ key: DateFilterKey; label: string }> = [
  { key: '24h', label: '24h' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: 'all', label: 'All' }
]

const DEFAULT_DATE_FILTER: DateFilterKey = '7d'

interface AgentSummary {
  agentId: string
  name: string
  status: 'running' | 'idle' | 'errored' | 'starting'
  model: string
  provider: string
  projectDir: string
  createdAt?: string
  startedAt?: string | null
}

interface AgentListProps {
  agents: AgentSummary[]
  onSelect: (agentId: string) => void
  onKill: (agentId: string) => void
  onRestart: (agentId: string) => void
}

export function AgentList({ agents, onSelect, onKill, onRestart }: AgentListProps) {
  const [projectSearch, setProjectSearch] = useState('')
  const [dateFilter, setDateFilter] = useState<DateFilterKey>(DEFAULT_DATE_FILTER)
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
      .map(([project, projectAgents]) => {
        const sortedAgents = [...projectAgents].sort((left, right) => {
          const rightTime = getAgentTimestampMs(right) ?? 0
          const leftTime = getAgentTimestampMs(left) ?? 0
          if (rightTime !== leftTime) {
            return rightTime - leftTime
          }
          return left.name.localeCompare(right.name)
        })

        const latestTimestamp = sortedAgents.reduce((latest, agent) => {
          const timestamp = getAgentTimestampMs(agent)
          if (timestamp === null) {
            return latest
          }
          return Math.max(latest, timestamp)
        }, Number.NEGATIVE_INFINITY)

        return { project, agents: sortedAgents, latestTimestamp }
      })
      .sort((left, right) => {
        if (right.latestTimestamp !== left.latestTimestamp) {
          return right.latestTimestamp - left.latestTimestamp
        }
        return left.project.localeCompare(right.project)
      })
      .map(({ project, agents }) => [project, agents] as const)
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
  const cutoffTimeMs = useMemo(() => getFilterCutoffMs(dateFilter), [dateFilter])

  const visibleProjects = useMemo(() => {
    return groupedProjects
      .map(([project, projectAgents]) => {
        const dateFilteredAgents = projectAgents.filter((agent) => matchesDateFilter(agent, cutoffTimeMs))
        if (dateFilteredAgents.length === 0) {
          return null
        }

        if (!normalizedSearch) {
          return [project, dateFilteredAgents] as const
        }

        if (project.toLowerCase().includes(normalizedSearch)) {
          return [project, dateFilteredAgents] as const
        }

        const agentNameFiltered = dateFilteredAgents.filter((agent) =>
          agent.name.toLowerCase().includes(normalizedSearch)
        )

        return agentNameFiltered.length > 0 ? [project, agentNameFiltered] as const : null
      })
      .filter((entry): entry is readonly [string, AgentSummary[]] => entry !== null)
  }, [groupedProjects, normalizedSearch, cutoffTimeMs])

  const visibleAgentCount = useMemo(
    () => visibleProjects.reduce((sum, [, projectAgents]) => sum + projectAgents.length, 0),
    [visibleProjects]
  )

  if (agents.length === 0) {
    return (
      <div style={emptyStyle}>
        <p>No sessions running</p>
        <p style={emptySubtextStyle}>
          Start a session on desktop to see it here.
        </p>
      </div>
    )
  }

  return (
    <div style={listStyle}>
      <div style={toolbarStyle}>
        <input
          style={searchInputStyle}
          type="search"
          value={projectSearch}
          onChange={(event) => setProjectSearch(event.target.value)}
          placeholder="Search projects or sessions"
          aria-label="Search projects or sessions"
        />

        <div style={filtersRowStyle}>
          {DATE_FILTERS.map((filter) => {
            const active = filter.key === dateFilter
            return (
              <button
                key={filter.key}
                type="button"
                style={filterChipStyle(active)}
                onClick={() => setDateFilter(filter.key)}
                aria-pressed={active}
              >
                {filter.label}
              </button>
            )
          })}
          <span style={resultCountStyle}>{visibleAgentCount} sessions</span>
        </div>
      </div>

      {visibleProjects.length === 0 && (
        <div style={emptySearchStyle}>
          <p>No matching sessions</p>
          <p style={emptySubtextStyle}>
            Try a different search or time window.
          </p>
        </div>
      )}

      {visibleProjects.map(([project, projectAgents]) => {
        const expanded = expandedProjects[project] ?? true

        return (
          <section key={project} style={projectSectionStyle}>
            <button
              type="button"
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
                      <button type="button" style={nameStyle} onClick={() => onSelect(agent.agentId)}>
                        {agent.name}
                      </button>
                    </div>

                    <div style={metaStyle}>
                      <span>{agent.provider} / {agent.model}</span>
                      <span>{formatRelativeActivity(agent)}</span>
                    </div>

                    <div style={actionsStyle}>
                      {agent.status === 'running' && (
                        <button type="button" style={killBtnStyle} onClick={() => onKill(agent.agentId)}>
                          Stop
                        </button>
                      )}
                      {(agent.status === 'idle' || agent.status === 'errored') && (
                        <button type="button" style={restartBtnStyle} onClick={() => onRestart(agent.agentId)}>
                          Restart
                        </button>
                      )}
                      <button type="button" style={chatBtnStyle} onClick={() => onSelect(agent.agentId)}>
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

function toTimestamp(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function getAgentTimestampMs(agent: AgentSummary): number | null {
  return toTimestamp(agent.startedAt) ?? toTimestamp(agent.createdAt)
}

function getFilterCutoffMs(filter: DateFilterKey): number | null {
  const now = Date.now()

  switch (filter) {
    case '24h':
      return now - 24 * 60 * 60 * 1000
    case '7d':
      return now - 7 * 24 * 60 * 60 * 1000
    case '30d':
      return now - 30 * 24 * 60 * 60 * 1000
    default:
      return null
  }
}

function matchesDateFilter(agent: AgentSummary, cutoffMs: number | null): boolean {
  if (cutoffMs === null) return true
  const timestamp = getAgentTimestampMs(agent)
  if (timestamp === null) return false
  return timestamp >= cutoffMs
}

function formatRelativeActivity(agent: AgentSummary): string {
  const timestamp = getAgentTimestampMs(agent)
  if (timestamp === null) return 'No timestamp'

  const deltaMs = Date.now() - timestamp
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return 'Just now'

  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (deltaMs < hour) {
    return `${Math.max(1, Math.floor(deltaMs / minute))}m ago`
  }

  if (deltaMs < day) {
    return `${Math.floor(deltaMs / hour)}h ago`
  }

  if (deltaMs < 30 * day) {
    return `${Math.floor(deltaMs / day)}d ago`
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric'
  }).format(new Date(timestamp))
}

function statusDotStyle(status: string): CSSProperties {
  const colors: Record<string, string> = {
    running: '#7EE787',
    idle: '#777777',
    errored: '#FF6B6B',
    starting: '#FFD166'
  }

  return {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: colors[status] || '#64748b',
    boxShadow: `0 0 0 4px ${colors[status] || '#64748b'}1f`,
    flexShrink: 0
  }
}

function filterChipStyle(active: boolean): CSSProperties {
  return {
    padding: '6px 10px',
    fontSize: '0.72rem',
    borderRadius: 999,
    border: active ? '1px solid #e8e8e8' : '1px solid #333333',
    color: active ? '#ffffff' : '#a0a0a0',
    background: active ? 'rgba(255, 255, 255, 0.08)' : '#191919',
    cursor: 'pointer',
    fontWeight: 600
  }
}

const listStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: '0 16px 16px'
}

const toolbarStyle: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 20,
  margin: '0 -16px',
  padding: '12px 16px 10px',
  background: '#191919',
  borderBottom: '1px solid #2a2a2a'
}

const searchInputStyle: CSSProperties = {
  width: '100%',
  border: '1px solid #2a2a2a',
  borderRadius: 10,
  background: '#191919',
  color: '#e8e8e8',
  padding: '10px 12px',
  fontSize: '0.875rem',
  outline: 'none'
}

const filtersRowStyle: CSSProperties = {
  marginTop: 10,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  overflowX: 'auto',
  paddingBottom: 2
}

const resultCountStyle: CSSProperties = {
  marginLeft: 'auto',
  fontSize: '0.72rem',
  color: '#a0a0a0',
  whiteSpace: 'nowrap'
}

const projectSectionStyle: CSSProperties = {
  border: '1px solid #2a2a2a',
  borderRadius: 14,
  background: '#191919',
  overflow: 'hidden',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)'
}

const projectHeaderStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: '#212121',
  border: 'none',
  color: '#e8e8e8',
  padding: '11px 12px',
  cursor: 'pointer'
}

const projectChevronStyle: CSSProperties = {
  fontSize: '0.72rem',
  opacity: 0.8
}

const projectTitleStyle: CSSProperties = {
  fontSize: '0.82rem',
  fontWeight: 700,
  textAlign: 'left'
}

const projectCountStyle: CSSProperties = {
  marginLeft: 'auto',
  padding: '2px 8px',
  borderRadius: 999,
  border: '1px solid #333333',
  fontSize: '0.6875rem',
  color: '#e8e8e8'
}

const projectBodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 10
}

const cardStyle: CSSProperties = {
  background: '#212121',
  borderRadius: 12,
  padding: 14,
  border: '1px solid #2a2a2a',
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
  fontSize: '0.95rem',
  fontWeight: 600,
  cursor: 'pointer',
  padding: 0,
  textAlign: 'left'
}

const metaStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: '0.74rem',
  color: '#a0a0a0',
  gap: 8
}

const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center'
}

const killBtnStyle: CSSProperties = {
  padding: '7px 12px',
  fontSize: '0.76rem',
  borderRadius: 8,
  border: '1px solid #f87171',
  color: '#f87171',
  background: 'transparent',
  cursor: 'pointer',
  fontWeight: 600
}

const restartBtnStyle: CSSProperties = {
  padding: '7px 12px',
  fontSize: '0.76rem',
  borderRadius: 8,
  border: '1px solid #ffd166',
  color: '#ffd166',
  background: 'transparent',
  cursor: 'pointer',
  fontWeight: 600
}

const chatBtnStyle: CSSProperties = {
  padding: '7px 12px',
  fontSize: '0.76rem',
  borderRadius: 8,
  border: '1px solid #e8e8e8',
  color: '#e8e8e8',
  background: 'transparent',
  cursor: 'pointer',
  marginLeft: 'auto',
  fontWeight: 600
}

const emptyStyle: CSSProperties = {
  textAlign: 'center',
  color: '#a0a0a0',
  padding: 28,
  border: '1px solid #2a2a2a',
  margin: '0 16px',
  borderRadius: 12,
  background: '#191919'
}

const emptySearchStyle: CSSProperties = {
  textAlign: 'center',
  color: '#e8e8e8',
  padding: 20,
  border: '1px solid #2a2a2a',
  borderRadius: 12,
  background: '#191919'
}

const emptySubtextStyle: CSSProperties = {
  marginTop: 6,
  fontSize: '0.75rem',
  color: '#666666'
}
