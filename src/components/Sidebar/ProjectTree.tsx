import { useState } from 'react'
import { AgentItem } from './AgentItem'
import { EditorIcon } from '../shared/EditorIcon'
import type { ProjectGroup, EditorId } from '@shared/types'
import { EDITOR_REGISTRY } from '@shared/types'
import styles from './ProjectTree.module.css'

interface ProjectTreeProps {
  group: ProjectGroup
  selectedAgentId: string | null
  onSelectAgent: (agentId: string) => void
  onNewAgentForProject: (projectDir: string) => void
  onRenameAgent: (agentId: string, newName: string) => void
  defaultEditor?: EditorId
}

export function ProjectTree({ group, selectedAgentId, onSelectAgent, onNewAgentForProject, onRenameAgent, defaultEditor = 'vscode' }: ProjectTreeProps) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className={styles.group}>
      <div className={styles.groupRow}>
        <button
          className={styles.groupHeader}
          onClick={() => setExpanded(!expanded)}
        >
          <span className={`${styles.chevron} ${expanded ? styles.expanded : ''}`}>
            <ChevronIcon />
          </span>
          <span className={styles.projectName}>{group.projectName}</span>
        </button>
        <button
          className={styles.addBtn}
          onClick={() => window.hydra.openInApp(defaultEditor, group.projectDir)}
          title={`Open in ${EDITOR_REGISTRY.find((e) => e.id === defaultEditor)?.label ?? 'Editor'}`}
        >
          <EditorIcon editor={defaultEditor} size={12} />
        </button>
        <button
          className={styles.addBtn}
          onClick={() => onNewAgentForProject(group.projectDir)}
          title={`New agent in ${group.projectName}`}
        >
          <PlusIcon />
        </button>
        <span className={styles.count}>{group.agents.length}</span>
      </div>

      {expanded && (
        <div className={styles.agentList}>
          {group.agents.map((agent) => (
            <AgentItem
              key={agent.id}
              agent={agent}
              isSelected={agent.id === selectedAgentId}
              onSelect={() => onSelectAgent(agent.id)}
              onRename={(newName) => onRenameAgent(agent.id, newName)}
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

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}
