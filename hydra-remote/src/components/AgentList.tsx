import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import claudeIcon from '../assets/claude-icon.png'
import codexIcon from '../assets/codex-icon.png'

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
                  <button
                    key={agent.agentId}
                    type="button"
                    style={cardStyle}
                    onClick={() => onSelect(agent.agentId)}
                  >
                    <div style={cardTopRowStyle}>
                      <div style={statusDotStyle(agent.status)} />
                      <span style={nameStyle}>{agent.name}</span>
                      <span style={timeStyle}>{formatRelativeActivity(agent)}</span>
                    </div>

                    <div style={cardBottomRowStyle}>
                      <span style={modelPillStyle}>
                        <img
                          src={agent.provider === 'codex' ? codexIcon : claudeIcon}
                          alt={agent.provider === 'codex' ? 'Codex' : 'Claude'}
                          style={providerIconStyle}
                        />
                        {formatModelLabel(agent.provider, agent.model)}
                      </span>
                      <span style={actionsSpacer} />
                      {agent.status === 'running' && (
                        <span
                          role="button"
                          style={killBtnStyle}
                          onClick={(e) => { e.stopPropagation(); onKill(agent.agentId) }}
                        >
                          Stop
                        </span>
                      )}
                      {(agent.status === 'idle' || agent.status === 'errored') && (
                        <span
                          role="button"
                          style={restartBtnStyle}
                          onClick={(e) => { e.stopPropagation(); onRestart(agent.agentId) }}
                        >
                          Restart
                        </span>
                      )}
                    </div>
                  </button>
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

function formatModelLabel(provider: string, model: string): string {
  if (provider === 'codex') return model.toUpperCase()
  return model.charAt(0).toUpperCase() + model.slice(1).toLowerCase()
}

const modelPillStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  background: 'rgba(255, 255, 255, 0.05)',
  borderRadius: 999,
  padding: '3px 9px 3px 4px',
  fontSize: '0.68rem',
  fontWeight: 500,
  color: '#888',
  lineHeight: 1.5
}

const providerIconStyle: CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: 3,
  objectFit: 'contain',
  flexShrink: 0
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
    padding: '5px 11px',
    fontSize: '0.7rem',
    borderRadius: 999,
    border: 'none',
    color: active ? '#ffffff' : '#666',
    background: active ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
    cursor: 'pointer',
    fontWeight: 600
  }
}

const listStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: '0 16px 16px'
}

const toolbarStyle: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 20,
  margin: '0 -16px',
  padding: '12px 16px 10px',
  background: 'rgba(17, 17, 17, 0.92)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)'
}

const searchInputStyle: CSSProperties = {
  width: '100%',
  border: '1px solid #2a2a2a',
  borderRadius: 12,
  background: '#1e1e1e',
  color: '#e8e8e8',
  padding: '11px 14px',
  fontSize: '0.85rem',
  outline: 'none'
}

const filtersRowStyle: CSSProperties = {
  marginTop: 10,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  overflowX: 'auto',
  paddingBottom: 2
}

const resultCountStyle: CSSProperties = {
  marginLeft: 'auto',
  fontSize: '0.7rem',
  color: '#666',
  whiteSpace: 'nowrap'
}

const projectSectionStyle: CSSProperties = {
  borderRadius: 14,
  background: '#161616',
  overflow: 'hidden'
}

const projectHeaderStyle: CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  background: 'transparent',
  border: 'none',
  color: '#e8e8e8',
  padding: '12px 14px',
  cursor: 'pointer'
}

const projectChevronStyle: CSSProperties = {
  fontSize: '0.7rem',
  opacity: 0.5
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
  border: '1px solid #2a2a2a',
  fontSize: '0.65rem',
  color: '#888'
}

const projectBodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '4px 8px 10px'
}

const cardStyle: CSSProperties = {
  width: '100%',
  background: '#1e1e1e',
  borderRadius: 12,
  padding: '12px 14px',
  border: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  cursor: 'pointer',
  textAlign: 'left',
  color: 'inherit',
  transition: 'background 150ms'
}

const cardTopRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8
}

const nameStyle: CSSProperties = {
  color: '#e8e8e8',
  fontSize: '0.88rem',
  fontWeight: 600,
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
}

const timeStyle: CSSProperties = {
  fontSize: '0.68rem',
  color: '#555',
  flexShrink: 0
}

const cardBottomRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8
}

const actionsSpacer: CSSProperties = {
  flex: 1
}

const killBtnStyle: CSSProperties = {
  padding: '4px 10px',
  fontSize: '0.7rem',
  borderRadius: 999,
  border: '1px solid rgba(248, 113, 113, 0.4)',
  color: '#f87171',
  background: 'rgba(248, 113, 113, 0.08)',
  cursor: 'pointer',
  fontWeight: 600
}

const restartBtnStyle: CSSProperties = {
  padding: '4px 10px',
  fontSize: '0.7rem',
  borderRadius: 999,
  border: '1px solid rgba(255, 209, 102, 0.4)',
  color: '#ffd166',
  background: 'rgba(255, 209, 102, 0.08)',
  cursor: 'pointer',
  fontWeight: 600
}

const emptyStyle: CSSProperties = {
  textAlign: 'center',
  color: '#666',
  padding: 32,
  margin: '0 16px',
  borderRadius: 14,
  background: '#161616'
}

const emptySearchStyle: CSSProperties = {
  textAlign: 'center',
  color: '#e8e8e8',
  padding: 24,
  borderRadius: 14,
  background: '#161616'
}

const emptySubtextStyle: CSSProperties = {
  marginTop: 6,
  fontSize: '0.75rem',
  color: '#555'
}
