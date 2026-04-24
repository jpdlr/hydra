import { AgentItem } from './AgentItem'
import { EditorIcon } from '../shared/EditorIcon'
import type { ProjectGroup, EditorId } from '@shared/types'
import { getEditorLabel } from '../../lib/editorUtils'
import styles from './ProjectTree.module.css'

interface ProjectTreeProps {
  group: ProjectGroup
  selectedAgentId: string | null
  onSelectAgent: (agentId: string) => void
  onNewAgentForProject: (projectDir: string) => void
  onRenameAgent: (agentId: string, newName: string) => void
  onRemoveAgent: (agentId: string) => void
  defaultEditor?: EditorId
  expanded: boolean
  onToggleExpanded: () => void
  numberedAgentMap?: Map<string, number>
}

export function ProjectTree({ group, selectedAgentId, onSelectAgent, onNewAgentForProject, onRenameAgent, onRemoveAgent, defaultEditor = 'vscode', expanded, onToggleExpanded, numberedAgentMap }: ProjectTreeProps) {

  return (
    <div className={styles.group}>
      <div className={styles.groupRow}>
        <button
          className={styles.groupHeader}
          onClick={onToggleExpanded}
        >
          <span className={`${styles.chevron} ${expanded ? styles.expanded : ''}`}>
            <ChevronIcon />
          </span>
          <FolderIcon open={expanded} />
          <span className={styles.projectName}>{group.projectName}</span>
        </button>
        <button
          className={styles.addBtn}
          onClick={() => window.hydra.openInApp(defaultEditor, group.projectDir)}
          title={`Open in ${getEditorLabel(defaultEditor)}`}
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
              onRemove={() => onRemoveAgent(agent.id)}
              hotkeyNumber={numberedAgentMap?.get(agent.id)}
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

function FolderIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg className={styles.folderIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 14l1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
      </svg>
    )
  }
  return (
    <svg className={styles.folderIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h16Z" />
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
