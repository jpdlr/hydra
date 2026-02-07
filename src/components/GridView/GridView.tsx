import { useMemo, useEffect } from 'react'
import { TerminalTile } from './TerminalTile'
import { BroadcastBar } from './BroadcastBar'
import type { ProjectGroup } from '@shared/types'
import styles from './GridView.module.css'

interface GridViewProps {
  projectGroups: ProjectGroup[]
  selectedProject: string | null
  onSelectProject: (projectDir: string) => void
  onTerminalData: (agentId: string, data: string) => void
  onTerminalResize: (agentId: string, cols: number, rows: number) => void
  onStartAgent: (agentId: string) => void
  onRemoveAgent: (agentId: string) => void
  onBroadcast: (input: string) => void
  onNewAgent: () => void
  rawOutputs: Map<string, string>
  expandedTileId: string | null
  onExpandedTileChange: (agentId: string | null) => void
}

export function GridView({
  projectGroups,
  selectedProject,
  onSelectProject,
  onTerminalData,
  onTerminalResize,
  onStartAgent,
  onRemoveAgent,
  onBroadcast,
  onNewAgent,
  rawOutputs,
  expandedTileId,
  onExpandedTileChange
}: GridViewProps) {
  const currentGroup = useMemo(
    () => projectGroups.find((g) => g.projectDir === selectedProject),
    [projectGroups, selectedProject]
  )

  const agents = currentGroup?.agents || []

  // Auto-select first project if none selected
  useEffect(() => {
    if (!selectedProject && projectGroups.length > 0) {
      onSelectProject(projectGroups[0].projectDir)
    }
  }, [selectedProject, projectGroups, onSelectProject])

  useEffect(() => {
    if (expandedTileId && !agents.some((agent) => agent.id === expandedTileId)) {
      onExpandedTileChange(null)
    }
  }, [expandedTileId, agents, onExpandedTileChange])

  if (projectGroups.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No agents running.</p>
        <button className={styles.createBtn} onClick={onNewAgent}>
          + Create Agent
        </button>
      </div>
    )
  }

  const gridClass = expandedTileId ? styles.gridExpanded : styles.grid

  return (
    <div className={styles.container}>
      {/* Project selector */}
      {projectGroups.length > 1 && (
        <div className={styles.projectSelector}>
          {projectGroups.map((g) => (
            <button
              key={g.projectDir}
              className={`${styles.projectTab} ${g.projectDir === selectedProject ? styles.activeTab : ''}`}
              onClick={() => onSelectProject(g.projectDir)}
            >
              {g.projectName}
              <span className={styles.tabCount}>{g.agents.length}</span>
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      <div className={gridClass}>
        {agents.map((agent) => (
          <TerminalTile
            key={agent.id}
            agent={agent}
            rawOutput={rawOutputs.get(agent.id) || ''}
            isExpanded={expandedTileId === agent.id}
            onToggleExpand={() =>
              onExpandedTileChange(expandedTileId === agent.id ? null : agent.id)
            }
            onTerminalData={(data) => onTerminalData(agent.id, data)}
            onTerminalResize={(cols, rows) => onTerminalResize(agent.id, cols, rows)}
            onStartOrRestart={() => onStartAgent(agent.id)}
            onRemove={() => onRemoveAgent(agent.id)}
            hidden={expandedTileId !== null && expandedTileId !== agent.id}
          />
        ))}
      </div>

      {/* Broadcast bar */}
      <BroadcastBar
        onBroadcast={onBroadcast}
        onNewAgent={onNewAgent}
        agentCount={agents.length}
      />
    </div>
  )
}
