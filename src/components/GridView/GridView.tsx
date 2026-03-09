import { useMemo, useEffect, useCallback, useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TerminalTile } from './TerminalTile'
import { BroadcastBar } from './BroadcastBar'
import { RUNNING_PROJECT_ID } from '@shared/types'
import type { GridColumns, ProjectGroup } from '@shared/types'
import { basename } from '@/lib/pathUtils'
import { useTileOrder } from '@/hooks/useTileOrder'
import styles from './GridView.module.css'

interface GridViewProps {
  projectGroups: ProjectGroup[]
  selectedProject: string | null
  onSelectProject: (projectDir: string) => void
  onTerminalData: (agentId: string, data: string) => void
  onTerminalResize: (agentId: string, cols: number, rows: number) => void
  onStartAgent: (agentId: string) => void
  onStopAgent: (agentId: string) => void
  onRemoveAgent: (agentId: string) => void
  onBroadcast: (input: string) => void
  onNewAgent: () => void
  rawOutputs: Map<string, string>
  expandedTileId: string | null
  onExpandedTileChange: (agentId: string | null) => void
  sessionMaxAgeDays: number
  gridColumns: GridColumns
  onGridColumnsChange: (cols: GridColumns) => void
}

const ACTIVE_STATUSES = ['running', 'starting']

const COLUMN_OPTIONS: { value: GridColumns; label: string; icon: React.ReactNode }[] = [
  {
    value: 'auto',
    label: 'Auto',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="1" y="1" width="5" height="5" rx="1" />
        <rect x="8" y="1" width="5" height="5" rx="1" />
        <rect x="1" y="8" width="5" height="5" rx="1" />
      </svg>
    )
  },
  {
    value: 2,
    label: '2 col',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="1" y="1" width="5" height="12" rx="1" />
        <rect x="8" y="1" width="5" height="12" rx="1" />
      </svg>
    )
  },
  {
    value: 3,
    label: '3 col',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="0.5" y="1" width="3.5" height="12" rx="1" />
        <rect x="5.25" y="1" width="3.5" height="12" rx="1" />
        <rect x="10" y="1" width="3.5" height="12" rx="1" />
      </svg>
    )
  }
]

function getGridClass(columns: GridColumns, expanded: boolean): string {
  if (expanded) return `${styles.gridBase} ${styles.gridExpanded}`
  switch (columns) {
    case 2:
      return `${styles.gridBase} ${styles.grid2}`
    case 3:
      return `${styles.gridBase} ${styles.grid3}`
    default:
      return `${styles.gridBase} ${styles.gridAuto}`
  }
}

function SortableTileWrapper({
  id,
  disabled,
  children
}: {
  id: string
  disabled: boolean
  children: (dragListeners: Record<string, unknown> | undefined) => React.ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id, disabled })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {children(disabled ? undefined : listeners)}
    </div>
  )
}

export function GridView({
  projectGroups,
  selectedProject,
  onSelectProject,
  onTerminalData,
  onTerminalResize,
  onStartAgent,
  onStopAgent,
  onRemoveAgent,
  onBroadcast,
  onNewAgent,
  rawOutputs,
  expandedTileId,
  onExpandedTileChange,
  sessionMaxAgeDays,
  gridColumns,
  onGridColumnsChange
}: GridViewProps) {
  const isRunning = selectedProject === RUNNING_PROJECT_ID
  const [recentCutoffTs, setRecentCutoffTs] = useState<number | null>(null)

  useEffect(() => {
    if (sessionMaxAgeDays <= 0) {
      setRecentCutoffTs(null)
      return
    }
    setRecentCutoffTs(Date.now() - sessionMaxAgeDays * 24 * 60 * 60 * 1000)
  }, [projectGroups, sessionMaxAgeDays])

  const recentGroups = useMemo(() => {
    if (sessionMaxAgeDays <= 0 || recentCutoffTs === null) return projectGroups
    const cutoff = recentCutoffTs
    return projectGroups
      .map((group) => ({
        ...group,
        agents: group.agents.filter(
          (a) =>
            a.status === 'running' ||
            a.status === 'starting' ||
            new Date(a.createdAt).getTime() > cutoff
        )
      }))
      .filter((group) => group.agents.length > 0)
  }, [projectGroups, recentCutoffTs, sessionMaxAgeDays])

  const agents = useMemo(() => {
    if (isRunning) {
      const all = recentGroups.flatMap((g) => g.agents)
      return all
        .filter((a) => ACTIVE_STATUSES.includes(a.status))
        .sort((a, b) => {
          const aTime = Date.parse(a.startedAt || a.createdAt)
          const bTime = Date.parse(b.startedAt || b.createdAt)
          return bTime - aTime
        })
    }
    const currentGroup = recentGroups.find((g) => g.projectDir === selectedProject)
    return currentGroup?.agents || []
  }, [recentGroups, selectedProject, isRunning])

  const { orderedIds, handleReorder } = useTileOrder(selectedProject, agents, isRunning)

  const sortedAgents = useMemo(() => {
    const idIndex = new Map(orderedIds.map((id, i) => [id, i]))
    return [...agents].sort((a, b) => {
      const ai = idIndex.get(a.id) ?? Infinity
      const bi = idIndex.get(b.id) ?? Infinity
      return ai - bi
    })
  }, [agents, orderedIds])

  const isDragDisabled = !!expandedTileId || isRunning

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    })
  )

  const [, setActiveDragId] = useState<string | null>(null)

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id))
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null)
      const { active, over } = event
      if (!over || active.id === over.id) return
      handleReorder(String(active.id), String(over.id))
    },
    [handleReorder]
  )

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null)
  }, [])

  const runningCount = useMemo(
    () => recentGroups
      .flatMap((g) => g.agents)
      .filter((a) => ACTIVE_STATUSES.includes(a.status)).length,
    [recentGroups]
  )

  // Auto-select first project if none selected
  useEffect(() => {
    if (!selectedProject && recentGroups.length > 0) {
      onSelectProject(recentGroups[0].projectDir)
    }
  }, [selectedProject, recentGroups, onSelectProject])

  useEffect(() => {
    if (expandedTileId && !agents.some((agent) => agent.id === expandedTileId)) {
      onExpandedTileChange(null)
    }
  }, [expandedTileId, agents, onExpandedTileChange])

  if (recentGroups.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No agents running.</p>
        <button className={styles.createBtn} onClick={onNewAgent}>
          + Create Agent
        </button>
      </div>
    )
  }

  const gridClass = getGridClass(gridColumns, !!expandedTileId)

  return (
    <div className={styles.container}>
      {/* Project selector bar */}
      <div className={styles.projectSelectorBar}>
        <div className={styles.projectSelector}>
          <button
            className={`${styles.projectTab} ${isRunning ? styles.activeTab : ''}`}
            onClick={() => onSelectProject(RUNNING_PROJECT_ID)}
          >
            Running
            <span className={styles.tabCount}>{runningCount}</span>
          </button>
          {recentGroups.map((g) => (
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

        {/* Column layout picker — pinned outside scroll */}
        <div className={styles.columnPicker}>
          {COLUMN_OPTIONS.map((opt) => (
            <button
              key={String(opt.value)}
              className={`${styles.columnBtn} ${gridColumns === opt.value ? styles.columnBtnActive : ''}`}
              onClick={() => onGridColumnsChange(opt.value)}
              title={opt.label}
            >
              {opt.icon}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={sortedAgents.map((a) => a.id)}
          strategy={rectSortingStrategy}
          disabled={isDragDisabled}
        >
          <div className={gridClass}>
            {sortedAgents.map((agent) => (
              <SortableTileWrapper
                key={agent.id}
                id={agent.id}
                disabled={isDragDisabled}
              >
                {(dragListeners) => (
                  <TerminalTile
                    agent={agent}
                    projectName={isRunning ? basename(agent.projectDir) : undefined}
                    rawOutput={rawOutputs.get(agent.id) || ''}
                    isExpanded={expandedTileId === agent.id}
                    onToggleExpand={() =>
                      onExpandedTileChange(expandedTileId === agent.id ? null : agent.id)
                    }
                    onTerminalData={(data) => onTerminalData(agent.id, data)}
                    onTerminalResize={(cols, rows) => onTerminalResize(agent.id, cols, rows)}
                    onStartOrRestart={() => onStartAgent(agent.id)}
                    onStopAgent={() => onStopAgent(agent.id)}
                    onRemove={() => onRemoveAgent(agent.id)}
                    hidden={expandedTileId !== null && expandedTileId !== agent.id}
                    dragListeners={dragListeners}
                  />
                )}
              </SortableTileWrapper>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Broadcast bar */}
      <BroadcastBar
        onBroadcast={onBroadcast}
        onNewAgent={onNewAgent}
        agentCount={agents.length}
      />
    </div>
  )
}
