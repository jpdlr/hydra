import { useState, useCallback, useRef, useEffect } from 'react'
import { ProjectTree } from './ProjectTree'
import { SearchBar } from './SearchBar'
import { SortDropdown } from './SortDropdown'
import { FilterDropdown } from './FilterDropdown'
import { FilterChips } from './FilterChips'
import { useFilterSort } from './useFilterSort'
import { fuzzyScore } from '../../lib/fuzzy'
import type { ProjectGroup, EditorId } from '@shared/types'
import styles from './Sidebar.module.css'

interface SidebarProps {
  projectGroups: ProjectGroup[]
  selectedAgentId: string | null
  onSelectAgent: (agentId: string) => void
  onNewAgent: () => void
  onNewAgentForProject: (projectDir: string) => void
  onRenameAgent: (agentId: string, newName: string) => void
  onRemoveAgent: (agentId: string) => void
  onStopAgent: (agentId: string) => void
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
  onRemoveAgent,
  onStopAgent,
  width,
  onWidthChange,
  sessionMaxAgeDays,
  defaultEditor = 'vscode'
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set(projectGroups.map((g) => g.projectDir)))
  const seenDirsRef = useRef<Set<string>>(new Set(projectGroups.map((g) => g.projectDir)))
  const [isDragging, setIsDragging] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const treeContainerRef = useRef<HTMLDivElement>(null)
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

  // Auto-expand newly appearing project groups (only the first time we see them)
  useEffect(() => {
    const newDirs: string[] = []
    for (const g of projectGroups) {
      if (!seenDirsRef.current.has(g.projectDir)) {
        seenDirsRef.current.add(g.projectDir)
        newDirs.push(g.projectDir)
      }
    }
    if (newDirs.length === 0) return
    setExpandedDirs((prev) => {
      const next = new Set(prev)
      for (const dir of newDirs) next.add(dir)
      return next
    })
  }, [projectGroups])

  const toggleDir = useCallback((dir: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(dir)) {
        next.delete(dir)
      } else {
        next.add(dir)
      }
      return next
    })
  }, [])

  // Cmd+Left = collapse all, Cmd+Right = expand all (when sidebar focused)
  useEffect(() => {
    const container = treeContainerRef.current
    if (!container) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setExpandedDirs(new Set())
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setExpandedDirs(new Set(projectGroups.map((g) => g.projectDir)))
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => container.removeEventListener('keydown', handleKeyDown)
  }, [projectGroups])

  // Exit selection mode automatically if there's nothing to select on.
  useEffect(() => {
    if (!searchQuery && selectionMode) setSelectionMode(false)
  }, [searchQuery, selectionMode])

  const filteredGroups = searchQuery
    ? processed
        .map((group) => {
          const projectScore = fuzzyScore(searchQuery, group.projectName)
          const scored = group.agents
            .map((a) => {
              const nameScore = fuzzyScore(searchQuery, a.name)
              const best = Math.max(nameScore, projectScore)
              return { agent: a, score: best }
            })
            .filter((entry) => entry.score >= 0)
            .sort((a, b) => b.score - a.score)
          return { ...group, agents: scored.map((e) => e.agent) }
        })
        .filter((group) => group.agents.length > 0)
    : processed

  // Numbered hotkeys (1-9) for the first results when in selection mode.
  const numberedAgentMap = (() => {
    if (!selectionMode) return new Map<string, number>()
    const map = new Map<string, number>()
    let n = 1
    for (const group of filteredGroups) {
      for (const agent of group.agents) {
        if (n > 9) return map
        map.set(agent.id, n++)
      }
    }
    return map
  })()

  useEffect(() => {
    if (!selectionMode) return
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      if (e.key === 'Escape') {
        e.preventDefault()
        setSelectionMode(false)
        return
      }
      if (e.key >= '1' && e.key <= '9') {
        const num = parseInt(e.key, 10)
        for (const [agentId, assigned] of numberedAgentMap) {
          if (assigned === num) {
            e.preventDefault()
            onSelectAgent(agentId)
            setSelectionMode(false)
            return
          }
        }
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [selectionMode, numberedAgentMap, onSelectAgent])

  return (
    <aside className={styles.sidebar} style={{ width }}>
      <div className={styles.searchWrapper}>
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          onEscapeWithValue={() => setSelectionMode(true)}
        />
      </div>

      <FilterChips chips={chips} onDismiss={dismissChip} />

      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>PROJECTS</span>
        <div className={styles.sectionActions}>
          <SortDropdown value={sortKey} onChange={setSortKey} />
          <FilterDropdown
            filter={filter}
            onChange={setFilter}
            onClear={clearAll}
            hasActive={hasActiveFilter}
          />
        </div>
      </div>

      <div ref={treeContainerRef} className={styles.treeContainer} tabIndex={-1}>
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
              numberedAgentMap={numberedAgentMap}
              onRemoveAgent={onRemoveAgent}
              onStopAgent={onStopAgent}
              defaultEditor={defaultEditor}
              expanded={expandedDirs.has(group.projectDir)}
              onToggleExpanded={() => toggleDir(group.projectDir)}
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
