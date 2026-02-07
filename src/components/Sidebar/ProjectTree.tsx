import { useState } from 'react'
import { AgentItem } from './AgentItem'
import type { ProjectGroup } from '@shared/types'
import styles from './ProjectTree.module.css'

interface ProjectTreeProps {
  group: ProjectGroup
  selectedAgentId: string | null
  onSelectAgent: (agentId: string) => void
}

export function ProjectTree({ group, selectedAgentId, onSelectAgent }: ProjectTreeProps) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className={styles.group}>
      <button
        className={styles.groupHeader}
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`${styles.chevron} ${expanded ? styles.expanded : ''}`}>
          <ChevronIcon />
        </span>
        <span className={styles.projectName}>{group.projectName}</span>
        <span className={styles.count}>{group.agents.length}</span>
      </button>

      {expanded && (
        <div className={styles.agentList}>
          {group.agents.map((agent) => (
            <AgentItem
              key={agent.id}
              agent={agent}
              isSelected={agent.id === selectedAgentId}
              onSelect={() => onSelectAgent(agent.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}
