import { useState, useCallback, useRef } from 'react'
import { ProjectTree } from './ProjectTree'
import { SearchBar } from './SearchBar'
import { SortDropdown } from './SortDropdown'
import { FilterDropdown } from './FilterDropdown'
import { FilterChips } from './FilterChips'
import { useFilterSort } from './useFilterSort'
import type { ProjectGroup, EditorId } from '@shared/types'
import styles from './Sidebar.module.css'

interface SidebarProps {
  projectGroups: ProjectGroup[]
  selectedAgentId: string | null
  onSelectAgent: (agentId: string) => void
  onNewAgent: () => void
  onNewAgentForProject: (projectDir: string) => void
  onRenameAgent: (agentId: string, newName: string) => void
  width: number
  onWidthChange: (width: number) => void
  sessionMaxAgeDays: number
  defaultEditor?: EditorId
}

const MIN_WIDTH = 200
const MAX_WIDTH = 480

export function Sidebar({
  projectGroups,
  selectedAgentId,
  onSelectAgent,
  onNewAgent,
  onNewAgentForProject,
  onRenameAgent,
  width,
  onWidthChange,
  sessionMaxAgeDays,
  defaultEditor = 'vscode'
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const {
    sortKey,
    setSortKey,
    filter,
    setFilter,
    processed,
    chips,
    hasActiveFilter,
    dismissChip,
    clearAll,
  } = useFilterSort(projectGroups, sessionMaxAgeDays)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      startXRef.current = e.clientX
      startWidthRef.current = width
      setIsDragging(true)

      const target = e.currentTarget as HTMLElement
      target.setPointerCapture(e.pointerId)

      const onPointerMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startXRef.current
        const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + delta))
        onWidthChange(newWidth)
      }

      const onPointerUp = () => {
        setIsDragging(false)
        target.releasePointerCapture(e.pointerId)
        target.removeEventListener('pointermove', onPointerMove)
        target.removeEventListener('pointerup', onPointerUp)
      }

      target.addEventListener('pointermove', onPointerMove)
      target.addEventListener('pointerup', onPointerUp)
    },
    [width, onWidthChange]
  )

  const filteredGroups = searchQuery
    ? processed
        .map((group) => ({
          ...group,
          agents: group.agents.filter(
            (a) =>
              a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              group.projectName.toLowerCase().includes(searchQuery.toLowerCase())
          )
        }))
        .filter((group) => group.agents.length > 0)
    : processed

  return (
    <aside className={styles.sidebar} style={{ width }}>
      <div className={styles.searchWrapper}>
        <SearchBar value={searchQuery} onChange={setSearchQuery}>
          <SortDropdown value={sortKey} onChange={setSortKey} />
          <FilterDropdown
            filter={filter}
            onChange={setFilter}
            onClear={clearAll}
            hasActive={hasActiveFilter}
          />
        </SearchBar>
      </div>

      <FilterChips chips={chips} onDismiss={dismissChip} />

      <div className={styles.sectionLabel}>PROJECTS</div>

      <div className={styles.treeContainer}>
        {filteredGroups.length === 0 ? (
          <div className={styles.empty}>
            {searchQuery || hasActiveFilter ? 'No matches' : 'No agents running'}
          </div>
        ) : (
          filteredGroups.map((group) => (
            <ProjectTree
              key={group.projectDir}
              group={group}
              selectedAgentId={selectedAgentId}
              onSelectAgent={onSelectAgent}
              onNewAgentForProject={onNewAgentForProject}
              onRenameAgent={onRenameAgent}
              defaultEditor={defaultEditor}
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

      <div
        className={`${styles.resizeHandle} ${isDragging ? styles.resizeHandleActive : ''}`}
        onPointerDown={handlePointerDown}
      />
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
