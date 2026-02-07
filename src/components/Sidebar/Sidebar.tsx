import { useState } from 'react'
import { ProjectTree } from './ProjectTree'
import { SearchBar } from './SearchBar'
import type { ProjectGroup } from '@shared/types'
import styles from './Sidebar.module.css'

interface SidebarProps {
  projectGroups: ProjectGroup[]
  selectedAgentId: string | null
  onSelectAgent: (agentId: string) => void
  onNewAgent: () => void
}

export function Sidebar({
  projectGroups,
  selectedAgentId,
  onSelectAgent,
  onNewAgent
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredGroups = searchQuery
    ? projectGroups
        .map((group) => ({
          ...group,
          agents: group.agents.filter(
            (a) =>
              a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              group.projectName.toLowerCase().includes(searchQuery.toLowerCase())
          )
        }))
        .filter((group) => group.agents.length > 0)
    : projectGroups

  return (
    <aside className={styles.sidebar}>
      <div className={styles.searchWrapper}>
        <SearchBar value={searchQuery} onChange={setSearchQuery} />
      </div>

      <div className={styles.sectionLabel}>PROJECTS</div>

      <div className={styles.treeContainer}>
        {filteredGroups.length === 0 ? (
          <div className={styles.empty}>
            {searchQuery ? 'No matches' : 'No agents running'}
          </div>
        ) : (
          filteredGroups.map((group) => (
            <ProjectTree
              key={group.projectDir}
              group={group}
              selectedAgentId={selectedAgentId}
              onSelectAgent={onSelectAgent}
            />
          ))
        )}
      </div>

      <div className={styles.footer}>
        <div className={styles.divider} />
        <button className={styles.newAgentBtn} onClick={onNewAgent}>
          <PlusIcon />
          New Agent
        </button>
      </div>
    </aside>
  )
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}
